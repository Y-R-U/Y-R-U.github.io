import * as THREE from 'three';

export const REFLECT_LAYER = 1;

// Planar mirror for the y=planeY floor. Renders only objects on REFLECT_LAYER, at reduced resolution,
// into a texture that glossy floor/water materials sample in screen-projected space.
export function createPlanarReflection(renderer, { scale = 0.5, planeY = 0 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(Math.max(2, size.x * scale | 0), Math.max(2, size.y * scale | 0),
    { type: THREE.HalfFloatType, samples: 0 });
  const cam = new THREE.PerspectiveCamera();
  cam.layers.set(REFLECT_LAYER);
  const texMatrix = new THREE.Matrix4();
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();
  const n = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3(), tgt = new THREE.Vector3(), camPos = new THREE.Vector3();
  const uniforms = {
    tReflect: { value: rt.texture },
    uReflectMatrix: { value: texMatrix },
    uReflectTexel: { value: new THREE.Vector2(1 / rt.width, 1 / rt.height) },
    uReflectOn: { value: scale > 0 ? 1 : 0 },
  };
  const R = {
    rt, cam, uniforms, scale, planeY, enabled: scale > 0, skip: 0, frame: 0,
    setSize(w, h) {
      if (!R.enabled) return;
      rt.setSize(Math.max(2, w * R.scale | 0), Math.max(2, h * R.scale | 0));
      uniforms.uReflectTexel.value.set(1 / rt.width, 1 / rt.height);
    },
    update(scene, camera) {
      if (!R.enabled) return;
      if (R.skip && (R.frame++ % (R.skip + 1)) !== 0) return;
      camera.updateMatrixWorld();
      camPos.setFromMatrixPosition(camera.matrixWorld);
      cam.position.set(camPos.x, 2 * planeY - camPos.y, camPos.z);
      camera.getWorldDirection(tmp);
      tgt.copy(camPos).add(tmp);
      tgt.y = 2 * planeY - tgt.y;
      cam.up.set(0, 1, 0);
      cam.lookAt(tgt);
      cam.far = camera.far; cam.near = camera.near;
      cam.updateMatrixWorld();
      cam.projectionMatrix.copy(camera.projectionMatrix);
      texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      texMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
      plane.setFromNormalAndCoplanarPoint(n, tmp.set(0, planeY, 0)).applyMatrix4(cam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const e = cam.projectionMatrix.elements;
      q.x = (Math.sign(clip.x) + e[8]) / e[0];
      q.y = (Math.sign(clip.y) + e[9]) / e[5];
      q.z = -1; q.w = (1 + e[10]) / e[14];
      clip.multiplyScalar(2 / clip.dot(q));
      e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
      const prevRT = renderer.getRenderTarget();
      const prevAuto = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(prevRT);
      renderer.shadowMap.autoUpdate = prevAuto;
    },
  };
  return R;
}

// Patches a MeshStandardMaterial so it adds the planar reflection, blurred by its roughness,
// with an artistically strong fresnel (the refs' floors read as near-mirror at any angle).
export function addPlanarReflection(material, R, { strength = 1, base = 0.28, blur = 3.0, distort = 0.04, tint = null } = {}) {
  const u = { ...R.uniforms, uReflStrength: { value: strength }, uReflBase: { value: base },
    uReflBlur: { value: blur }, uReflDistort: { value: distort }, uReflTint: { value: tint || new THREE.Color(1, 1, 1) } };
  material.userData.reflUniforms = u;
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey?.call(material) || '';
  material.onBeforeCompile = (sh, r) => {
    prev?.call(material, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflectMatrix;\nvarying vec4 vReflPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvReflPos = uReflectMatrix * vec4( ( modelMatrix * vec4( transformed, 1.0 ) ).xyz, 1.0 );');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tReflect; uniform vec2 uReflectTexel; uniform float uReflectOn, uReflStrength, uReflBase, uReflBlur, uReflDistort;
uniform vec3 uReflTint;
varying vec4 vReflPos;`)
      .replace('#include <opaque_fragment>', `
{
  float NdV = clamp( dot( normal, geometryViewDir ), 0.0, 1.0 );
  float gloss = pow( clamp( 1.0 - roughnessFactor, 0.0, 1.0 ), 2.0 );
  float F = mix( uReflBase, 1.0, pow( 1.0 - NdV, 3.0 ) ) * gloss * uReflStrength;
  if ( uReflectOn > 0.5 ) {
    vec3 nd = normal - normalize( vNormal );
    vec2 ruv = vReflPos.xy / vReflPos.w + nd.xy * uReflDistort;
    float br = uReflBlur * ( 0.25 + roughnessFactor * 4.0 );
    vec2 o = uReflectTexel * br;
    vec3 rc = texture2D( tReflect, ruv ).rgb * 0.28;
    rc += texture2D( tReflect, ruv + vec2( o.x, o.y * 2.0 ) ).rgb * 0.18;
    rc += texture2D( tReflect, ruv + vec2( -o.x, -o.y * 2.0 ) ).rgb * 0.18;
    rc += texture2D( tReflect, ruv + vec2( -o.x * 1.5, o.y * 3.5 ) ).rgb * 0.18;
    rc += texture2D( tReflect, ruv + vec2( o.x * 1.5, -o.y * 3.5 ) ).rgb * 0.18;
    rc = min( rc, vec3( 6.0 ) );
    outgoingLight = outgoingLight * ( 1.0 - F * 0.55 ) + rc * uReflTint * F;
  }
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => prevKey + 'planarRefl';
  return material;
}

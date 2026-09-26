import * as THREE from 'three';

// Contact AO for the promenade, baked once at load: an orthographic camera under the floor looking UP renders the
// lowest surface height of everything above the plaza, then a blur pass turns "something sits within ~1.4 m of the
// floor nearby" into a soft occlusion term. The floor shader samples it (one fetch) to ground planters, benches,
// kiosks, bollards and building bases. Robots get live soft contact disks (`contacts`) on top.
const BAKE_LAYER = 7;
export const MAX_CONTACTS = 12;

export function bakeGroundAO(renderer, scene, { x0, x1, z0, z1 }, { texel = 0.2 } = {}) {
  const W = Math.min(1024, Math.ceil((x1 - x0) / texel)), H = Math.min(1024, Math.ceil((z1 - z0) / texel));
  const cam = new THREE.OrthographicCamera(-(x1 - x0) / 2, (x1 - x0) / 2, (z1 - z0) / 2, -(z1 - z0) / 2, 0.01, 60);
  cam.position.set((x0 + x1) / 2, -0.25, (z0 + z1) / 2);
  cam.up.set(0, 0, 1);
  cam.lookAt(cam.position.x, 10, cam.position.z);
  cam.updateMatrixWorld();
  cam.layers.set(BAKE_LAYER);

  const tagged = [];
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.name === 'ground' || !o.visible) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.isShaderMaterial) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    if (box.min.y > 2.5 || box.max.y < -0.05) return;
    if (box.max.x < x0 || box.min.x > x1 || box.max.z < z0 || box.min.z > z1) return;
    o.layers.enable(BAKE_LAYER); tagged.push(o);
  });

  const hRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });
  const hMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: 'varying float vY; void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'varying float vY; void main() { if ( vY < -0.05 ) discard; gl_FragColor = vec4( vY, 0.0, 0.0, 1.0 ); }',
  });
  const aoRT = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const N = 40;
  const aoMat = new THREE.ShaderMaterial({
    uniforms: { tH: { value: hRT.texture }, uTexel: { value: new THREE.Vector2((x1 - x0) / W, (z1 - z0) / H) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tH; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        const float R = 1.5;
        float occ = 0.0, wsum = 0.0;
        for ( int i = 0; i < ${N}; i++ ) {
          float f = ( float( i ) + 0.5 ) / ${N}.0;
          float r = R * sqrt( f ), a = float( i ) * 2.39996;
          vec2 o = vec2( cos( a ), sin( a ) ) * r;
          vec4 hs = texture2D( tH, vUv + o / ( uTexel * vec2( textureSize( tH, 0 ) ) ) );
          float c = hs.a * ( 1.0 - smoothstep( 0.0, 1.4, hs.r ) );
          float w = 1.0 - r / ( R * 1.05 );
          occ += c * w; wsum += w;
        }
        gl_FragColor = vec4( clamp( occ / wsum * 1.7, 0.0, 1.0 ), 0.0, 0.0, 1.0 );
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), aoMat);
  quad.frustumCulled = false; quad.layers.set(BAKE_LAYER);
  const qScene = new THREE.Scene(); qScene.add(quad);

  const prevRT = renderer.getRenderTarget(), prevOverride = scene.overrideMaterial, prevBg = scene.background, prevFog = scene.fog;
  const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevShadow = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  scene.overrideMaterial = hMat; scene.background = null; scene.fog = null;
  renderer.setRenderTarget(hRT); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, cam);
  scene.overrideMaterial = prevOverride; scene.background = prevBg; scene.fog = prevFog;
  renderer.setRenderTarget(aoRT); renderer.setClearColor(0x000000, 1); renderer.clear();
  renderer.render(qScene, cam);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevA);
  renderer.shadowMap.autoUpdate = prevShadow;
  for (const o of tagged) o.layers.disable(BAKE_LAYER);
  hRT.dispose(); hMat.dispose(); aoMat.dispose(); quad.geometry.dispose();

  // world (x, 0, z) → bake uv
  const mat = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const uvMat = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1).multiply(mat);
  return { texture: aoRT.texture, uvMat, rt: aoRT, meshes: tagged.length, size: [W, H] };
}

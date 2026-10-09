import * as THREE from 'three';
import { createRobot } from '../actors/robots.js';
import { SUN_DIR } from '../engine/atmosphere.js';
import { REFLECT_LAYER, MIRROR_ONLY_LAYER } from '../fx/reflection.js';
import { rng } from './textures.js';

// Distant crowd: camera-facing impostors baked once from the real civilian robots (walk cycle, 3 views), walked along
// straight lanes entirely in the vertex shader. One draw call for the whole district; they fade in only beyond the
// real crowd's range, so up close you always see real robots.
const KINDS = ['civ_gold', 'civ_chrome', 'civ_black', 'civ_worker'];
const COLS = 9, VIEWS = 3, CW = 64, CH = 128;   // 8 walk frames + 1 idle; views: front, side (facing screen-right), back
const NEAR0 = 21, NEAR1 = 26, FRAME_H = 2.1, FOOT = 0.05;

export function bakeCrowdAtlas(renderer, environment) {
  const W = CW * COLS, H = CH * KINDS.length * VIEWS;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  // each cell renders into a small MSAA target, then a quad copies it into its atlas slot (three invalidates an MSAA
  // target's samples after every resolve, so cells can't accumulate in one multisampled target)
  const cell = new THREE.WebGLRenderTarget(CW, CH, { type: THREE.HalfFloatType, samples: 4 });
  const copy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { map: { value: cell.texture } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = texture2D(map, vUv); }',
  }));
  copy.frustumCulled = false;
  const copyScene = new THREE.Scene(); copyScene.add(copy);
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 0.75;
  const sun = new THREE.DirectionalLight(0xffe0bc, 3.3);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xbcd4ff, 0x8a7358, 0.3));
  const h = FRAME_H;
  const cam = new THREE.OrthographicCamera(-h / 4, h / 4, h / 2, -h / 2, 0.1, 40);
  const prev = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), shadow: renderer.shadowMap.enabled, autoClear: renderer.autoClear };
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt); renderer.clear();
  const el = 10 * Math.PI / 180, look = new THREE.Vector3(0, h / 2 - FOOT, 0), rv = new THREE.Vector3(), fv = new THREE.Vector3();
  KINDS.forEach((kind, k) => {
    const bot = createRobot({ kind, seed: 211 + k * 31, quality: 'high', merged: true });
    scene.add(bot.root);
    bot.setMove(0, 1.3);
    for (let i = 0; i < 60; i++) bot.update(0.05);
    const shoot = (col) => {
      bot.root.updateMatrixWorld(true);
      for (let v = 0; v < VIEWS; v++) {
        // front: camera on +Z (the robot faces +Z); side: camera on -X so it faces screen-right; back: camera on -Z
        const a = [0, -Math.PI / 2, Math.PI][v];
        cam.position.set(Math.sin(a) * Math.cos(el) * 12, look.y + Math.sin(el) * 12, Math.cos(a) * Math.cos(el) * 12);
        cam.lookAt(look);
        cam.updateMatrixWorld();
        // key light from the camera's upper left, so every view reads sunlit on the same side
        rv.setFromMatrixColumn(cam.matrixWorld, 0); fv.subVectors(cam.position, look).normalize();
        sun.position.copy(fv).multiplyScalar(0.6).addScaledVector(rv, -0.7).setY(0.8).multiplyScalar(20);
        renderer.setRenderTarget(cell); renderer.clear(); renderer.render(scene, cam);
        const row = k * VIEWS + v;
        rt.viewport.set(col * CW, H - (row + 1) * CH, CW, CH);
        renderer.setRenderTarget(rt); renderer.render(copyScene, cam);
      }
    };
    for (let f = 0; f < 8; f++) {
      for (let g = 0; g < 500 && Math.abs(((bot.phase - f / 8) % 1 + 1.5) % 1 - 0.5) > 0.006; g++) bot.update(0.004);
      shoot(f);
    }
    bot.setMove(0, 0);
    for (let i = 0; i < 60; i++) bot.update(0.05);
    shoot(8);
    scene.remove(bot.root);
    bot.dispose();
  });
  rt.viewport.set(0, 0, W, H);
  renderer.setRenderTarget(prev.target);
  renderer.setClearColor(prev.color, prev.alpha); renderer.shadowMap.enabled = prev.shadow; renderer.autoClear = prev.autoClear;
  cell.dispose(); copy.geometry.dispose(); copy.material.dispose();
  return rt;
}

export function createFarCrowdMaterial(texture, time, { a2c = false } = {}) {
  const m = new THREE.ShaderMaterial({
    name: 'farCrowd',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uTime: { value: 0 } }]),
    vertexShader: /* glsl */`
      attribute vec4 iA;   // lane start x, z, unit dir x, z
      attribute vec4 iB;   // length, speed (0 = standing), phase 0..1, kind
      attribute vec2 iC;   // ground y, scale
      uniform float uTime;
      varying vec2 vUv;
      varying float vFade;
      #include <fog_pars_vertex>
      void main() {
        float L = iB.x, sp = iB.y;
        float d = sp > 0.0 ? mod( iB.z * 2.0 * L + uTime * sp, 2.0 * L ) : iB.z * L;
        float fw = d < L ? 1.0 : -1.0;
        vec2 p = iA.xy + iA.zw * ( d < L ? d : 2.0 * L - d );
        vec2 head = sp > 0.0 ? iA.zw * fw : iA.zw;
        vec2 t = cameraPosition.xz - p;
        float dist = length( t );
        t /= max( dist, 1e-3 );
        vec3 right = vec3( t.y, 0.0, -t.x );
        float H = ${FRAME_H.toFixed(3)} * iC.y;
        vec3 wp = vec3( p.x, iC.x - ${FOOT.toFixed(3)} * iC.y, p.y ) + right * position.x * H * 0.5 + vec3( 0.0, position.y * H, 0.0 );
        float c = dot( head, t );
        float view = c > 0.5 ? 0.0 : c < -0.5 ? 2.0 : 1.0;
        float u = position.x + 0.5;
        if ( view == 1.0 && dot( head, right.xz ) < 0.0 ) u = 1.0 - u;
        float fr = sp > 0.0 ? floor( fract( uTime * sp * 0.62 + iB.z * 7.0 ) * 8.0 ) : 8.0;
        float row = iB.w * ${VIEWS.toFixed(1)} + view;
        vUv = vec2( ( fr + u ) / ${COLS.toFixed(1)}, 1.0 - ( row + 1.0 - position.y ) / ${(KINDS.length * VIEWS).toFixed(1)} );
        vFade = smoothstep( ${NEAR0.toFixed(1)}, ${NEAR1.toFixed(1)}, dist );
        vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv;
      varying float vFade;
      #include <fog_pars_fragment>
      void main() {
        vec4 c = texture2D( map, vUv );
        float a = c.a;
        // sharpen mip-averaged alpha to a ~1 px ramp, or thin far limbs read see-through
        ${a2c ? 'a = clamp( ( a - 0.5 ) / max( fwidth( a ), 1e-4 ) + 0.5, 0.0, 1.0 );' : ''}
        a *= vFade;
        ${a2c ? 'if ( a < 0.02 ) discard;' : 'if ( a < 0.5 ) discard; a = 1.0;'}
        gl_FragColor = vec4( c.rgb / max( c.a, 1e-3 ), a );
        #include <fog_fragment>
      }`,
    fog: true, side: THREE.DoubleSide,
  });
  m.alphaToCoverage = a2c;
  m.uniforms.map.value = texture;
  m.uniforms.uTime = time;
  // The non-MSAA mirror can't do alpha-to-coverage: fractional alpha there lets the floor's bright sky term through,
  // drawing a white 'shadow' under every far bot (2026-10-10). The mirror gets a cutout copy instead.
  if (a2c) m.userData.mirror = createFarCrowdMaterial(texture, time);
  return m;
}

// n impostors on straight lanes that stay clear of collision (sampled every metre), plus `extra` hand-given lanes
// [x0, x1, z0, z1, y] (rects; walkers go along the long side) for streets past the play bounds. ~30% stand in place.
export function addFarCrowd(ctx, material, n, { extra = [], seed = 5 } = {}) {
  if (!n) return null;
  const { col, scene } = ctx;
  const B = col.bounds, R = rng(seed);
  const lanes = [];
  const clear = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), y = col.groundAt(x0, z0);
    for (let s = 0; s <= len; s += 1) {
      const x = x0 + (x1 - x0) * s / len, z = z0 + (z1 - z0) * s / len;
      if (col.blocked(x, z, 0.45) || Math.abs(col.groundAt(x, z) - y) > 0.05) return false;
    }
    return true;
  };
  const nIn = Math.round(n * (extra.length ? 0.55 : 1));
  for (let tries = 0; lanes.length < nIn && tries < nIn * 40; tries++) {
    const x0 = B.x0 + R() * (B.x1 - B.x0), z0 = B.z0 + R() * (B.z1 - B.z0), a = R() * Math.PI * 2;
    const stand = R() < 0.3, len = stand ? 0.01 : 6 + R() * 22;
    const x1 = x0 + Math.sin(a) * len, z1 = z0 + Math.cos(a) * len;
    if (!clear(x0, z0, x1, z1)) continue;
    lanes.push([x0, z0, x1, z1, col.groundAt(x0, z0), stand]);
  }
  for (let i = 0; lanes.length < n && extra.length && i < n * 4; i++) {
    const [x0, x1, z0, z1, y] = extra[i % extra.length];
    const stand = R() < 0.25, len = stand ? 0.01 : 10 + R() * 40, dir = R() < 0.5 ? 1 : -1;
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    lanes.push(Math.abs(z1 - z0) > Math.abs(x1 - x0) ? [x, z, x, z + dir * len, y, stand] : [x, z, x + dir * len, z, y, stand]);
  }
  const N = lanes.length;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const A = new Float32Array(N * 4), Bv = new Float32Array(N * 4), C = new Float32Array(N * 2);
  lanes.forEach(([x0, z0, x1, z1, y, stand], i) => {
    const len = Math.max(0.01, Math.hypot(x1 - x0, z1 - z0));
    const a = stand ? R() * Math.PI * 2 : 0;
    const dx = stand ? Math.sin(a) : (x1 - x0) / len, dz = stand ? Math.cos(a) : (z1 - z0) / len;
    A.set([x0, z0, dx, dz], i * 4);
    const r = R();
    Bv.set([len, stand ? 0 : 1.05 + R() * 0.45, R(), r < 0.31 ? 0 : r < 0.62 ? 1 : r < 0.9 ? 2 : 3], i * 4);
    C.set([y, 0.94 + R() * 0.12], i * 2);
  });
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
  g.setAttribute('iB', new THREE.InstancedBufferAttribute(Bv, 4));
  g.setAttribute('iC', new THREE.InstancedBufferAttribute(C, 2));
  g.instanceCount = N;
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.name = 'farCrowd';
  if (material.userData.mirror) {
    const mirror = new THREE.Mesh(g, material.userData.mirror);
    mirror.frustumCulled = false;
    mirror.name = 'farCrowdMirror';
    mirror.layers.set(MIRROR_ONLY_LAYER);
    mesh.add(mirror);
  } else mesh.layers.enable(REFLECT_LAYER);
  scene.add(mesh);
  ctx.stats.farCrowd = N;
  return mesh;
}

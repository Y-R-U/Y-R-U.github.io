import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

let tex = null;
function haloTexture() {
  if (tex) return tex;
  const n = 64, c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.18, 'rgba(255,200,120,0.55)');
  g.addColorStop(0.5, 'rgba(255,160,80,0.12)'); g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Camera-facing additive glow sprites, one draw call. list: [x, y, z, size]. The quad is pulled toward the camera by
// its radius so walls right behind a lamp don't slice it.
export function makeHalos(list, { opacity = 0.85, fog = true } = {}) {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog, toneMapped: false, opacity,
  }), list.length);
  mesh.material.onBeforeCompile = (s) => {
    // fades out as the lens gets close (a halo right by the camera whited out cutscene shots)
    s.vertexShader = 'varying float vHaloFade;\n' + s.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vHaloFade = smoothstep(0.8, 2.6, -mvPosition.z);
      float sc = length(instanceMatrix[0].xyz);
      vec3 toCam = normalize(-mvPosition.xyz);
      mvPosition.xyz += toCam * min(sc * 0.5, -mvPosition.z * 0.5);
      mvPosition.xy += position.xy * sc;
      gl_Position = projectionMatrix * mvPosition;`);
    s.fragmentShader = 'varying float vHaloFade;\n' + s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.a *= vHaloFade;');
  };
  const m = new THREE.Matrix4();
  list.forEach(([x, y, z, s], i) => { m.makeScale(s, s, s).setPosition(x, y, z); mesh.setMatrixAt(i, m); });
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.name = 'halos';
  return mesh;
}

// Flat additive light pools on the ground, one draw call. list: [x, y, z, size].
export function makePools(list, { opacity = 0.38 } = {}) {
  const quads = list.map(([x, y, z, s]) => { const g = new THREE.PlaneGeometry(s, s); g.rotateX(-Math.PI / 2); g.translate(x, y, z); return g; });
  const mesh = new THREE.Mesh(mergeGeometries(quads), new THREE.MeshBasicMaterial({
    map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, fog: true, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -4,
  }));
  mesh.renderOrder = 2;
  mesh.name = 'pools';
  return mesh;
}

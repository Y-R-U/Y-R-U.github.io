// Three.js scene boilerplate: renderer, camera, lights, sky.

import * as THREE from 'three';
import { CFG } from './config.js';

export function createSceneStack(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CFG.world.skyColor);
  scene.fog = new THREE.Fog(CFG.world.fogColor, CFG.world.fogNear, CFG.world.fogFar);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);
  camera.position.set(0, 22, -22);
  camera.lookAt(0, 2, 0);

  // ── Lights ──
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3a5a2a, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe5b8, 1.3);
  sun.position.set(60, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0x6080a0, 0.35);
  scene.add(ambient);

  // ── Sky dome ──
  addSkyDome(scene);

  // ── Resize wiring ──
  function onResize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', onResize);

  return { renderer, scene, camera, sun };
}

function addSkyDome(scene) {
  const geom = new THREE.SphereGeometry(380, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(0x355c8c) },
      midColor:    { value: new THREE.Color(0x9bbfd6) },
      bottomColor: { value: new THREE.Color(0xd6a878) },
    },
    vertexShader: `
      varying float vY;
      void main() {
        vY = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, bottomColor;
      varying float vY;
      void main() {
        float t = clamp(vY, -1.0, 1.0);
        vec3 c = (t > 0.15)
          ? mix(midColor, topColor, smoothstep(0.15, 1.0, t))
          : mix(bottomColor, midColor, smoothstep(-0.3, 0.15, t));
        gl_FragColor = vec4(c, 1.0);
      }`,
    fog: false,
  });
  scene.add(new THREE.Mesh(geom, mat));
}

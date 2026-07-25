// Renderer, scene, camera and the post chain. Owns nothing gameplay-related —
// every other visual module adds into `scene` (or one of the roots below).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LITE_MODE, CAM } from './config.js';
import { profile } from './save.js';

export let renderer, scene, camera, composer, bloomPass, sunLight, hemiLight;

// Roots so a battle teardown can nuke its own content and nothing else.
export const envRoot = new THREE.Group();      // sky, clouds, weather, lights
export const fieldRoot = new THREE.Group();    // terrain + props + decor
export const actorRoot = new THREE.Group();    // tanks, drones, shells, fx

export let lowQuality = LITE_MODE;

export function glowBasic(hex, boost = 1.6, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex).multiplyScalar(boost), ...opts,
  });
}

export function initRender(container) {
  lowQuality = LITE_MODE || !!profile.settings.lite;

  renderer = new THREE.WebGLRenderer({
    antialias: !lowQuality, powerPreference: 'high-performance', stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowQuality ? 1 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = !lowQuality;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a2230, 90, 620);
  scene.add(envRoot, fieldRoot, actorRoot);

  camera = new THREE.PerspectiveCamera(
    CAM.baseFov, window.innerWidth / window.innerHeight, 0.4, 2200);
  camera.position.set(0, 22, 46);

  hemiLight = new THREE.HemisphereLight(0x9fc4e8, 0x4a4030, 1.0);
  envRoot.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff0d0, 1.9);
  sunLight.position.set(70, 90, -60);
  sunLight.castShadow = !lowQuality;
  sunLight.shadow.mapSize.set(lowQuality ? 512 : 2048, lowQuality ? 512 : 2048);
  const sc = sunLight.shadow.camera;
  sc.left = -125; sc.right = 125; sc.top = 125; sc.bottom = -125;
  sc.near = 12; sc.far = 460;
  sunLight.shadow.bias = -0.0007;
  sunLight.shadow.normalBias = 0.035;
  envRoot.add(sunLight, sunLight.target);

  renderer.info.autoReset = false;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (!lowQuality) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.62, 0.78);
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());

  window.addEventListener('resize', onResize);
  onResize();
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  if (bloomPass) bloomPass.resolution.set(w, h);
}

export function setBloom(strength, radius = 0.62, threshold = 0.78) {
  if (!bloomPass) return;
  bloomPass.strength = strength;
  bloomPass.radius = radius;
  bloomPass.threshold = threshold;
}

// Stats are accumulated across every post pass rather than reset per pass, so
// `lastFrame` is the honest per-frame cost.
export const lastFrame = { calls: 0, tris: 0 };

export function render() {
  composer.render();
  lastFrame.calls = renderer.info.render.calls;
  lastFrame.tris = renderer.info.render.triangles;
  renderer.info.reset();
}

// Deep-dispose everything under a group and empty it.
export function clearGroup(group) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    group.remove(child);
    disposeObject(child);
  }
}

export function disposeObject(obj) {
  obj.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    const m = n.material;
    if (!m) return;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m.dispose();
  });
}

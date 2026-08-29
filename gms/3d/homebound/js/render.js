// Renderer, camera, lights, and the one render() everything else feeds.
//
// The camera is the reason the reference frames read the way they do: it sits
// well back and high, aimed at a point AHEAD of the squad, and it retreats as
// the squad grows. A fixed camera makes 300 men an unreadable smear at the
// bottom of the screen — the pull-back is what keeps the crowd, the gates and
// the enemy column all in frame at once.

import * as THREE from 'three';
import { CAM, PAL, ROAD, pickQuality, DEV_MODE } from './config.js';
import { state } from './state.js';
import { clamp, approach } from './utils.js';
import { on } from './bus.js';

export const ctx = {
  scene: null, camera: null, renderer: null, quality: null,
  sun: null, hemi: null, container: null, aspect: 1,
};

let shake = 0, shakeSeed = 0;
let camBack = CAM.back, camHigh = CAM.height, roll = 0;

export function initRender(container) {
  const q = pickQuality();
  ctx.quality = q;
  ctx.container = container;

  const renderer = new THREE.WebGLRenderer({
    antialias: q.name !== 'low', powerPreference: 'high-performance',
    stencil: false, alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  if (q.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  container.appendChild(renderer.domElement);
  ctx.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.sky);
  // Fog does double duty: it hides the end of the recycled road, and it is why
  // a gate 60 m out reads as "later" rather than "small".
  scene.fog = new THREE.Fog(PAL.fog, 68, 185);
  ctx.scene = scene;

  const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.5, 400);
  camera.position.set(0, CAM.height, -CAM.back);
  scene.add(camera);
  ctx.camera = camera;

  // Two lights, no more. A hemisphere for the flat fill the style wants and one
  // directional for the shadow that gives the crowd its footing.
  const hemi = new THREE.HemisphereLight(0xdfeaf2, 0x5b6350, 1.05);
  scene.add(hemi);
  ctx.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.25);
  sun.position.set(-34, 52, -18);
  if (q.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    // A tight box around the play area. Wide shadow cameras are how a 512 map
    // turns into mush; the corridor is only 30 m across so we spend it there.
    const s = sun.shadow.camera;
    s.left = -26; s.right = 26; s.top = 44; s.bottom = -22;
    s.near = 1; s.far = 130;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.035;
  }
  scene.add(sun);
  scene.add(sun.target);
  ctx.sun = sun;

  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resize, 120), { passive: true });

  on('fx:shake', ({ amount }) => { shake = Math.min(1.4, shake + (amount || 0.2)); });

  if (DEV_MODE) window.__hbRender = ctx;
  return ctx;
}

export function resize() {
  if (!ctx.renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  ctx.aspect = w / h;
  ctx.renderer.setSize(w, h, false);
  ctx.camera.aspect = ctx.aspect;
  // Portrait phones are tall and narrow: at a fixed vertical FOV the corridor
  // fills the width and everything interesting is off the sides. Widen the
  // vertical FOV as the frame gets taller so the 11 m road always fits.
  ctx.camera.fov = clamp(CAM.fov * (0.62 / Math.min(0.9, Math.max(0.4, ctx.aspect))), 42, 74);
  ctx.camera.updateProjectionMatrix();
}

// The camera is driven from state, never from an object it follows, so the
// autoplay backdrop on the main screen uses exactly the same path as a run.
export function updateCamera(dt, opts = {}) {
  const cam = ctx.camera;
  if (!cam) return;
  const grow = Math.min(CAM.maxExtra, state.troops * CAM.perUnit * 12);
  const wantBack = (opts.back ?? CAM.back) + grow;
  const wantHigh = (opts.height ?? CAM.height) + grow * 0.72;
  camBack = approach(camBack, wantBack, CAM.lag, dt);
  camHigh = approach(camHigh, wantHigh, CAM.lag, dt);

  // The camera trails the squad's x by less than 1:1. Full tracking makes the
  // road feel like it is sliding under a fixed squad; partial tracking is what
  // sells "you moved".
  const followX = state.x * 0.55;
  const px = followX, py = camHigh, pz = state.z - camBack;

  shake = Math.max(0, shake * Math.pow(CAM.shakeDecay, dt * 60));
  shakeSeed += dt * 47;
  const sh = shake * shake * 0.55;
  cam.position.set(
    px + Math.sin(shakeSeed * 1.7) * sh,
    py + Math.sin(shakeSeed * 2.3) * sh * 0.8,
    pz + Math.sin(shakeSeed * 1.1) * sh * 0.4
  );

  const look = opts.look ?? CAM.look;
  cam.lookAt(followX * 0.5, 1.2, state.z + look);

  // A little roll toward the drag. It is 3° and nobody notices it consciously,
  // which is the point.
  roll = approach(roll, clamp((state.targetX - state.x) * 0.06, -1, 1) * CAM.tiltMax, 0.9, dt);
  cam.rotation.z += roll;

  // Keep the shadow box travelling with the squad or the crowd walks out of it.
  if (ctx.sun.castShadow) {
    ctx.sun.position.set(state.x - 34, 52, state.z + 6);
    ctx.sun.target.position.set(state.x, 0, state.z + 18);
    ctx.sun.target.updateMatrixWorld();
  }
}

export function addShake(a) { shake = Math.min(1.4, shake + a); }

export function render() {
  if (ctx.renderer) ctx.renderer.render(ctx.scene, ctx.camera);
}

export function drawCalls() { return ctx.renderer?.info.render.calls ?? 0; }

// Screen position of a world point, for floating damage numbers and bubbles
// that have to sit on a thing in the 3D scene.
const _v = new THREE.Vector3();
export function toScreen(x, y, z) {
  _v.set(x, y, z).project(ctx.camera);
  return {
    x: (_v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
    behind: _v.z > 1,
  };
}

export const ROAD_HALF = ROAD.halfW;

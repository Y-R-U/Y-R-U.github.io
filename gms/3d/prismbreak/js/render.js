// Scene / camera / bloom / themed background. Exposes world<->screen helpers.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GRID, THEMES } from './config.js';

export const R = {
  scene: null, camera: null, renderer: null, composer: null,
  boardGroup: null, gemLayer: null, fxLayer: null,
  lite: false, shake: 0, theme: THEMES.aurora,
  bgMat: null, crystals: [], stars: null, tiles: [], frame: null,
  keyLight: null, rimA: null, rimB: null,
};

const BOARD_W = GRID.cols, BOARD_H = GRID.rows;

export function cellToWorld(r, c) {
  return {
    x: c - (GRID.cols - 1) / 2,
    y: (GRID.rows - 1) / 2 - r,
    z: 0,
  };
}

export function initRender(lite) {
  R.lite = lite;
  const container = document.getElementById('game-container');
  R.renderer = new THREE.WebGLRenderer({ antialias: !lite, powerPreference: 'high-performance' });
  R.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  R.renderer.setSize(window.innerWidth, window.innerHeight);
  R.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  R.renderer.toneMappingExposure = 1.1;
  container.appendChild(R.renderer.domElement);

  R.scene = new THREE.Scene();
  R.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);

  // environment reflections (cheap, no HDR download)
  const pmrem = new THREE.PMREMGenerator(R.renderer);
  R.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // lights
  R.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  R.keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  R.keyLight.position.set(4, 8, 10);
  R.scene.add(R.keyLight);
  R.rimA = new THREE.PointLight(0x8f5dff, 40, 40); R.rimA.position.set(-8, 5, 4);
  R.rimB = new THREE.PointLight(0x2ec5ff, 40, 40); R.rimB.position.set(8, -6, 4);
  R.scene.add(R.rimA, R.rimB);

  // board group (slight cinematic tilt)
  R.boardGroup = new THREE.Group();
  R.boardGroup.rotation.x = -0.1;
  R.scene.add(R.boardGroup);
  R.gemLayer = new THREE.Group();
  R.fxLayer = new THREE.Group();
  R.boardGroup.add(R.gemLayer, R.fxLayer);

  buildBoardFrame();
  buildBackground();

  if (!lite) {
    R.composer = new EffectComposer(R.renderer);
    R.composer.addPass(new RenderPass(R.scene, R.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.6, 0.82);
    R.composer.addPass(bloom);
  }

  window.addEventListener('resize', onResize);
  onResize();
}

function buildBoardFrame() {
  // checkered translucent tiles
  const tileGeo = new THREE.BoxGeometry(0.96, 0.96, 0.12);
  const matA = new THREE.MeshPhysicalMaterial({ color: 0x0d0b22, transparent: true, opacity: 0.55, roughness: 0.3, metalness: 0.2 });
  const matB = matA.clone(); matB.opacity = 0.38;
  R.tileMatA = matA; R.tileMatB = matB;
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      const tile = new THREE.Mesh(tileGeo, (r + c) % 2 ? matA : matB);
      const p = cellToWorld(r, c);
      tile.position.set(p.x, p.y, -0.55);
      R.boardGroup.add(tile);
      R.tiles.push(tile);
    }
  }
  // metallic frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8fa3ff, metalness: 1, roughness: 0.35, envMapIntensity: 1.5 });
  R.frameMat = frameMat;
  const bar = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), frameMat);
    m.position.set(x, y, -0.5);
    R.boardGroup.add(m);
  };
  const W = BOARD_W + 0.35, H = BOARD_H + 0.35;
  bar(W + 0.3, 0.18, 0, H / 2); bar(W + 0.3, 0.18, 0, -H / 2);
  bar(0.18, H + 0.3, W / 2, 0); bar(0.18, H + 0.3, -W / 2, 0);
}

function buildBackground() {
  // vertical gradient billboard
  const bgGeo = new THREE.PlaneGeometry(160, 220);
  R.bgMat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(0x120f2e) },
      bot: { value: new THREE.Color(0x1c0b33) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec2 vUv; void main(){ gl_FragColor=vec4(mix(bot,top,vUv.y),1.0); }',
    depthWrite: false,
  });
  const bg = new THREE.Mesh(bgGeo, R.bgMat);
  bg.position.z = -40;
  R.scene.add(bg);

  // giant slow crystals drifting behind the board
  const cGeo = new THREE.OctahedronGeometry(1, 0);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(cGeo, new THREE.MeshPhysicalMaterial({
      color: 0x6a5dff, metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.35,
      emissive: 0x6a5dff, emissiveIntensity: 0.25, flatShading: true,
    }));
    const s = 1.5 + Math.random() * 3.5;
    m.scale.set(s, s * (1.2 + Math.random()), s);
    m.position.set((Math.random() - 0.5) * 34, (Math.random() - 0.5) * 40, -14 - Math.random() * 14);
    m.userData.spin = (Math.random() - 0.5) * 0.3;
    m.userData.drift = 0.1 + Math.random() * 0.25;
    m.userData.baseY = m.position.y;
    R.scene.add(m);
    R.crystals.push(m);
  }

  // starfield sparkles
  const n = 220, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 2] = -8 - Math.random() * 28;
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  R.starMat = new THREE.PointsMaterial({ color: 0xbfd0ff, size: 0.16, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  R.stars = new THREE.Points(sGeo, R.starMat);
  R.scene.add(R.stars);
}

export function applyTheme(theme) {
  R.theme = theme;
  R.bgMat.uniforms.top.value.setHex(theme.bgTop);
  R.bgMat.uniforms.bot.value.setHex(theme.bgBot);
  R.scene.fog = new THREE.Fog(theme.fog, 30, 70);
  R.frameMat.color.setHex(theme.frame);
  R.tileMatA.color.setHex(theme.boardTint);
  R.tileMatB.color.setHex(theme.boardTint);
  R.starMat.color.setHex(theme.star);
  for (const c of R.crystals) {
    c.material.color.setHex(theme.crystal);
    c.material.emissive.setHex(theme.crystal);
  }
  R.rimA.color.setHex(theme.crystal);
  R.rimB.color.setHex(theme.star);
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  R.camera.aspect = w / h;
  // pull the camera back until the whole board fits (portrait or landscape)
  const fitH = (BOARD_H + 3.6) / 2 / Math.tan((R.camera.fov / 2) * Math.PI / 180);
  const fitW = ((BOARD_W + 1.4) / 2 / Math.tan((R.camera.fov / 2) * Math.PI / 180)) / R.camera.aspect;
  R.camDist = Math.max(fitH, fitW);
  R.camera.position.set(0, -0.4, R.camDist);
  R.camera.lookAt(0, -0.2, 0);
  R.camera.updateProjectionMatrix();
  R.renderer.setSize(w, h);
  if (R.composer) R.composer.setSize(w, h);
}

const _v = new THREE.Vector3();
// world position (board space) → CSS pixels
export function worldToScreen(x, y, z = 0) {
  _v.set(x, y, z);
  R.boardGroup.localToWorld(_v);
  _v.project(R.camera);
  return {
    x: (_v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

// CSS pixels → board cell {r,c} or null
export function screenToCell(px, py) {
  const ndc = new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, R.camera);
  // intersect the board plane (board group is tilted)
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(R.boardGroup.quaternion);
  const plane = new THREE.Plane(normal, 0);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  R.boardGroup.worldToLocal(hit);
  const c = Math.round(hit.x + (GRID.cols - 1) / 2);
  const r = Math.round((GRID.rows - 1) / 2 - hit.y);
  if (r < 0 || c < 0 || r >= GRID.rows || c >= GRID.cols) return null;
  return { r, c };
}

let last = 0;
export function renderFrame(t) {
  const dt = Math.min((t - last) / 1000, 0.05); last = t;
  for (const c of R.crystals) {
    c.rotation.y += c.userData.spin * dt;
    c.rotation.x += c.userData.spin * 0.6 * dt;
    c.position.y = c.userData.baseY + Math.sin(t / 4000 * c.userData.drift * 10) * 1.2;
  }
  if (R.stars) R.stars.rotation.z += dt * 0.004;

  // screen shake decay
  if (R.shake > 0.001) {
    R.camera.position.x = (Math.random() - 0.5) * R.shake;
    R.camera.position.y = -0.4 + (Math.random() - 0.5) * R.shake;
    R.shake *= Math.pow(0.001, dt); // fast decay
  } else if (R.camera.position.x !== 0) {
    R.camera.position.x = 0; R.camera.position.y = -0.4;
  }

  if (R.composer) R.composer.render();
  else R.renderer.render(R.scene, R.camera);
  return dt;
}

export function addShake(amount) {
  R.shake = Math.min(R.shake + amount, 0.5);
}

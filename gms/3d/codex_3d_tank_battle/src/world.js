import * as THREE from 'three';
import { ARENA_RADIUS, COLORS } from './config.js';
import { randomBetween } from './utils.js';

const geometries = {
  ground: new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS + 3, 0.34, 48),
  rim: new THREE.TorusGeometry(ARENA_RADIUS + 0.7, 0.2, 8, 96),
  rock: new THREE.DodecahedronGeometry(1, 0),
  trunk: new THREE.CylinderGeometry(0.22, 0.34, 2.2, 7),
  leaf: new THREE.ConeGeometry(1.1, 2.0, 7),
  depot: new THREE.BoxGeometry(2.8, 1.2, 2.8),
  cloud: new THREE.IcosahedronGeometry(1, 0)
};

export function createWorld(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17463f);
  scene.fog = new THREE.Fog(0x17463f, 52, 132);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 220);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0xd9fff2, 0x111511, 1.2));

  const sun = new THREE.DirectionalLight(0xfff1c1, 2.5);
  sun.position.set(-26, 36, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 1, far: 110, left: -55, right: 55, top: 55, bottom: -55 });
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  const arenaLight = new THREE.PointLight(0x4ff8ff, 1.6, 72);
  arenaLight.position.set(0, 15, 0);
  scene.add(arenaLight);

  const materials = {
    ground: new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x70ff95, emissive: 0x1b6b3b, emissiveIntensity: 0.48, roughness: 0.5 }),
    rock: new THREE.MeshStandardMaterial({ color: COLORS.rock, roughness: 0.88 }),
    trunk: new THREE.MeshStandardMaterial({ color: COLORS.trunk, roughness: 0.78 }),
    leaf: new THREE.MeshStandardMaterial({ color: COLORS.leaf, roughness: 0.82 }),
    depot: new THREE.MeshStandardMaterial({ color: 0x28302f, roughness: 0.78, metalness: 0.2 }),
    cloud: new THREE.MeshBasicMaterial({ color: 0xf6fff8, transparent: true, opacity: 0.28 })
  };

  const ground = new THREE.Mesh(geometries.ground, materials.ground);
  ground.position.y = -0.18;
  ground.receiveShadow = true;
  scene.add(ground);

  const rim = new THREE.Mesh(geometries.rim, materials.rim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.03;
  scene.add(rim);

  const obstacles = [];
  createObstacles(scene, materials, obstacles);
  createClouds(scene, materials);

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', resize);

  return { scene, camera, renderer, obstacles, dispose: () => window.removeEventListener('resize', resize) };
}

function createObstacles(scene, materials, obstacles) {
  const fixed = [
    [-12, -8, 2.2], [13, -7, 2.4], [-4, 12, 2.1], [9, 15, 2.7], [-18, 10, 2.0],
    [19, 5, 2.1], [-21, -18, 2.3], [22, -18, 2.2]
  ];

  fixed.forEach(([x, z, radius], index) => {
    const depot = new THREE.Mesh(geometries.depot, materials.depot);
    depot.position.set(x, 0.55, z);
    depot.rotation.y = randomBetween(0, Math.PI);
    depot.scale.setScalar(randomBetween(0.9, 1.18));
    depot.castShadow = true;
    depot.receiveShadow = true;
    scene.add(depot);
    obstacles.push({ position: depot.position, radius, mesh: depot, blocksShells: index % 2 === 0 });
  });

  for (let i = 0; i < 34; i += 1) {
    const angle = (i / 34) * Math.PI * 2 + randomBetween(-0.08, 0.08);
    const radius = randomBetween(24, 38);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const item = Math.random() > 0.48 ? createTree(materials) : createRock(materials);
    item.position.set(x, 0, z);
    item.rotation.y = randomBetween(0, Math.PI * 2);
    item.scale.setScalar(randomBetween(0.72, 1.18));
    scene.add(item);
    obstacles.push({ position: item.position, radius: Math.random() > 0.48 ? 1.35 : 1.05, mesh: item, blocksShells: false });
  }
}

function createTree(materials) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(geometries.trunk, materials.trunk);
  trunk.position.y = 1;
  trunk.castShadow = true;
  tree.add(trunk);

  for (let i = 0; i < 3; i += 1) {
    const leaf = new THREE.Mesh(geometries.leaf, materials.leaf);
    leaf.position.y = 2 + i * 0.62;
    leaf.scale.setScalar(1.05 - i * 0.17);
    leaf.castShadow = true;
    tree.add(leaf);
  }
  return tree;
}

function createRock(materials) {
  const rock = new THREE.Mesh(geometries.rock, materials.rock);
  rock.position.y = 0.45;
  rock.scale.set(1.2, 0.64, 0.9);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function createClouds(scene, materials) {
  for (let i = 0; i < 8; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j += 1) {
      const puff = new THREE.Mesh(geometries.cloud, materials.cloud);
      puff.position.set((j - 1.5) * 1.5, Math.sin(j) * 0.25, Math.cos(j * 1.7) * 0.45);
      puff.scale.setScalar(randomBetween(1.2, 2.3));
      cloud.add(puff);
    }
    cloud.position.set(-48 + i * 13, randomBetween(24, 34), randomBetween(-54, -36));
    scene.add(cloud);
  }
}

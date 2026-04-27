// Terrain, decoration (trees, rocks, grass), clouds, terrain queries.

import * as THREE from 'three';
import { CFG } from './config.js';

export function terrainHeight(x, z) {
  const d = Math.sqrt(x * x + z * z);
  // flat near origin, gentle hills further out
  const flatness = Math.min(1, Math.max(0, (d - 14) / 30));
  return (Math.sin(x * 0.07) * Math.cos(z * 0.06) * 1.6 +
          Math.sin(x * 0.13 + 1) * Math.cos(z * 0.11 + 0.5) * 0.9 +
          Math.sin(x * 0.24 + z * 0.21) * 0.35) * flatness;
}

export function buildWorld(scene) {
  const terrain = buildTerrain();
  scene.add(terrain);
  scatterDecor(scene);
  const clouds = buildClouds(scene);
  buildArenaRing(scene);
  return { terrain, clouds };
}

function buildTerrain() {
  const { size, segs } = CFG.world;
  const geom = new THREE.PlaneGeometry(size, size, segs, segs);
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
  }
  geom.computeVertexNormals();

  const colors = [];
  const cBase = new THREE.Color(0x6c8a44);
  const cDark = new THREE.Color(0x3f5a28);
  const cHi   = new THREE.Color(0x8ea055);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.max(0, Math.min(1, (y + 1) / 3));
    const jitter = (Math.random() - 0.5) * 0.25;
    const blend = Math.max(0, Math.min(1, t + jitter));
    const c = cDark.clone().lerp(cBase, blend).lerp(cHi, Math.max(0, blend - 0.6) * 0.6);
    colors.push(c.r, c.g, c.b);
  }
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 0,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildTree() {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshPhongMaterial({ color: 0x3a2614, flatShading: true });
  const leafShades = [0x2d4a1f, 0x335224, 0x28411a, 0x3a5a26];
  const leafMat = new THREE.MeshPhongMaterial({
    color: leafShades[Math.floor(Math.random() * leafShades.length)],
    flatShading: true,
  });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 1.3, 6),
    trunkMat
  );
  trunk.position.y = 0.65;
  trunk.castShadow = true;
  g.add(trunk);
  const layers = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < layers; i++) {
    const r = 1.4 - i * 0.3;
    const h = 1.4;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), leafMat);
    cone.position.y = 1.1 + i * 0.9;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

function scatterDecor(scene) {
  const size = CFG.world.size;
  const arenaR = CFG.world.arenaRadius;

  // Trees mostly outside arena, some inside as cover.
  for (let i = 0; i < 160; i++) {
    const r = (i < 30)
      ? 30 + Math.random() * (arenaR - 35)            // some inside arena
      : arenaR + 6 + Math.pow(Math.random(), 0.7) * (size * 0.4);
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const tree = buildTree();
    tree.position.set(x, terrainHeight(x, z) - 0.1, z);
    tree.scale.setScalar(0.8 + Math.random() * 0.7);
    tree.rotation.y = Math.random() * Math.PI * 2;
    scene.add(tree);
  }

  // Rocks — good cover around arena
  const rockMat = new THREE.MeshPhongMaterial({ color: 0x6c7077, flatShading: true });
  const rockDark = new THREE.MeshPhongMaterial({ color: 0x4a4e55, flatShading: true });
  for (let i = 0; i < 90; i++) {
    const r = (i < 20)
      ? 18 + Math.random() * (arenaR - 24)
      : arenaR + 4 + Math.random() * (size * 0.42);
    const a = Math.random() * Math.PI * 2;
    const sz = 0.6 + Math.random() * 1.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const rock = new THREE.Mesh(
      Math.random() < 0.5
        ? new THREE.DodecahedronGeometry(sz, 0)
        : new THREE.IcosahedronGeometry(sz, 0),
      Math.random() < 0.6 ? rockMat : rockDark
    );
    rock.position.set(x, terrainHeight(x, z) + sz * 0.3, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  // Grass tufts
  const grassMat = new THREE.MeshPhongMaterial({ color: 0x7da852, flatShading: true });
  for (let i = 0; i < 320; i++) {
    const x = (Math.random() - 0.5) * size * 0.8;
    const z = (Math.random() - 0.5) * size * 0.8;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), grassMat);
    tuft.position.set(x, terrainHeight(x, z) + 0.2, z);
    tuft.rotation.y = Math.random() * Math.PI;
    scene.add(tuft);
  }
}

function buildClouds(scene) {
  const clouds = [];
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff3d8,
    transparent: true,
    opacity: 0.85,
    fog: false,
  });
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(2.4 + Math.random() * 2.0, 6, 4),
        mat
      );
      puff.position.set(
        j * 2.8 - puffs * 1.2 + (Math.random() - 0.5),
        (Math.random() - 0.5),
        (Math.random() - 0.5) * 1.5
      );
      puff.scale.y = 0.55;
      g.add(puff);
    }
    g.position.set(
      (Math.random() - 0.5) * 280,
      52 + Math.random() * 16,
      (Math.random() - 0.5) * 280
    );
    g.userData.drift = (0.4 + Math.random() * 1.0) * (Math.random() < 0.5 ? 1 : -1);
    scene.add(g);
    clouds.push(g);
  }
  return clouds;
}

function buildArenaRing(scene) {
  // Subtle visual hint for the arena boundary.
  const segments = 96;
  const r = CFG.world.arenaRadius;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    points.push(new THREE.Vector3(x, terrainHeight(x, z) + 0.05, z));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0x00d8ff,
    transparent: true,
    opacity: 0.35,
    fog: true,
  });
  const ring = new THREE.LineLoop(geom, mat);
  scene.add(ring);
}

export function updateClouds(clouds, dt) {
  for (const c of clouds) {
    c.position.x += c.userData.drift * dt;
    if (c.position.x > 170) c.position.x = -170;
    if (c.position.x < -170) c.position.x = 170;
  }
}

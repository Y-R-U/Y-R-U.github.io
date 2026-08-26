// Scene assembly. Kept apart from renderer.js so the lab page can build the same world without
// the frame loop.

import * as THREE from 'three';
import { makeCamera } from './camera.js';
import { makeLighting } from './lighting.js';
import { makeSky } from './sky.js';
import { makeClouds } from './clouds.js';
import { makeBackdrop } from './backdrop.js';
import { makeTerrain } from './terrain.js';
import { makeActors } from './actors.js';
import { makeExplosions } from './explosions.js';
import { makeDebris } from './debris.js';
import { makeFx } from './fx.js';
import './bakers.js';

export function makeScene() {
  const scene = new THREE.Scene();
  const camApi = makeCamera();
  scene.add(camApi.cam);

  const lighting = makeLighting(scene, camApi);
  const sky = makeSky(camApi);
  camApi.cam.add(sky.group);

  const clouds = makeClouds(camApi);
  scene.add(clouds.root);
  const backdrop = makeBackdrop(camApi);
  scene.add(backdrop.root);
  const terrain = makeTerrain(camApi);
  scene.add(terrain.root);

  const explosions = makeExplosions(camApi, scene);
  camApi.cam.add(explosions.white);
  const debris = makeDebris(scene);
  const actors = makeActors(camApi, scene);
  const fx = makeFx(camApi, scene, explosions, debris);

  return { scene, camApi, lighting, sky, clouds, backdrop, terrain, actors, explosions, debris, fx };
}

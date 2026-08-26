// Sky backdrop, horizon glow, sun disc and stars. Camera-locked quads, ART.md §3 layers 1-2.
//
// The gradient is sampled by TRUE WORLD Y, not by screen position: the plate maps
// bakers.SKY_TOP..SKY_BOT linearly, so climbing really does fly you up into the zenith and the
// hot horizon bloom stays welded to the ground line. Pixels come through plates.js, so a
// Flux-generated sky plate drops in with no code change.

import * as THREE from 'three';
import { getPlate } from './plates.js';
import { SKY_TOP, SKY_BOT } from './bakers.js';
import { makeTex, makeBin } from './materials.js';

const SKY_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const SKY_FRAG = `
uniform sampler2D map; uniform float uCamY, uVh, uTop, uBot, uScrollU;
varying vec2 vUv;
void main() {
  float wy = uCamY + (vUv.y - 0.5) * uVh;
  float v = clamp((uTop - wy) / (uTop - uBot), 0.002, 0.998);
  gl_FragColor = vec4(texture2D(map, vec2(fract(vUv.x * 0.25 + uScrollU), v)).rgb, 1.0);
  #include <colorspace_fragment>
}
`;

export function makeSky(camApi) {
  const bin = makeBin();
  const group = new THREE.Group();
  group.frustumCulled = false;
  group.renderOrder = -1000;

  const Z = -60;   // camera-local; sits between the near plane and everything else
  const quad = new THREE.PlaneGeometry(1, 1);

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: null }, uCamY: { value: 0 }, uVh: { value: 900 },
      uTop: { value: SKY_TOP }, uBot: { value: SKY_BOT }, uScrollU: { value: 0 },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    depthWrite: false, depthTest: false, fog: false,
  });
  const skyMesh = new THREE.Mesh(quad, skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;
  group.add(skyMesh);

  const starMat = new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    fog: false, opacity: 0,
  });
  const starMesh = new THREE.Mesh(quad, starMat);
  starMesh.frustumCulled = false; starMesh.renderOrder = -999;
  group.add(starMesh);

  const sunMat = new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    fog: false, opacity: 0,
  });
  const sunMesh = new THREE.Mesh(quad, sunMat);
  sunMesh.frustumCulled = false; sunMesh.renderOrder = -998;
  group.add(sunMesh);

  let pal = null, qw = 1, qh = 1;

  function fit() {
    const h = 2 * Math.tan((camApi.cam.fov * Math.PI / 180) / 2) * Math.abs(Z);
    qh = h; qw = h * camApi.cam.aspect;
    skyMesh.scale.set(qw * 1.02, qh * 1.02, 1);
    skyMesh.position.set(0, 0, Z);
    starMesh.scale.set(qw, qh, 1);
    starMesh.position.set(0, 0, Z + 0.4);
    skyMat.uniforms.uVh.value = camApi.vh;
  }

  return {
    group, fit,

    setPalette(p, key) {
      pal = p;
      bin.dispose();
      const sky = makeTex(getPlate('sky', p, key, p.biome), { wrapX: true, aniso: 1 });
      sky.flipY = false;
      skyMat.uniforms.map.value = bin.keep(sky);

      const stars = makeTex(getPlate('stars', p, key), { wrapX: true, wrapY: true, repeatX: 3, repeatY: 2 });
      starMat.map = bin.keep(stars);
      starMat.opacity = p.star;
      starMat.visible = p.star > 0.02;
      starMat.needsUpdate = true;

      const sun = makeTex(getPlate('sun', p, key));
      sunMat.map = bin.keep(sun);
      sunMat.color.set(p.sun.col);
      sunMat.opacity = p.sun.discK;
      sunMat.visible = p.sun.discK > 0.03;
      sunMat.needsUpdate = true;
      fit();
    },

    /** camY is the camera CENTRE world y. */
    update(camX, camY) {
      if (!pal) return;
      skyMat.uniforms.uCamY.value = camY;
      skyMat.uniforms.uVh.value = camApi.vh;
      skyMat.uniforms.uScrollU.value = (camX * 0.00002) % 1;

      if (starMat.visible) {
        starMat.map.offset.set((camX * 0.03) / 2400, -(camY * 0.05) / 1800);
        starMat.opacity = pal.star * Math.min(1, Math.max(0.35, (camY + 500) / 1500));
      }
      if (sunMat.visible) {
        // The disc is composited at a fixed fraction of the viewport, just above the horizon.
        const r = qh * 0.85;
        sunMesh.scale.set(r, r, 1);
        const sy = (140 + pal.sun.elevDeg * 9 - camY) / camApi.vh;
        sunMesh.position.set((pal.sun.screenX - 0.5) * qw, Math.max(-0.62, Math.min(0.9, sy)) * qh, Z + 0.6);
      }
    },

    dispose() { bin.dispose(); quad.dispose(); skyMat.dispose(); starMat.dispose(); sunMat.dispose(); },
  };
}

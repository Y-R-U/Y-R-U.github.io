// Sun, bounce and fog. Fog is the whole atmosphere budget (CONTRACTS §14).
//
// THE FOG TRICK worth knowing: with a narrow-FOV camera parked ~2550 units back, every gameplay
// object sits at essentially the SAME distance from the camera, so a linear fog whose `near` is
// just in front of the gameplay plane leaves the whole playfield untouched and hazes only the
// negative-z background. That gives the reference's hazed mountains for free AND satisfies
// ART.md §2's "keep fog off the player" without a per-object exception.

import * as THREE from 'three';
import { mix } from './palette.js';

const D2R = Math.PI / 180;

export function makeLighting(scene, camApi) {
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 6;
  const sc = sun.shadow.camera;
  sc.near = 200; sc.far = 9000;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.6);
  const amb = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(amb);
  scene.add(hemi);

  // Fill from the CAMERA side. On a backlit level (dawn/dusk sit at azim 152-168) this is the only
  // light reaching the faces we actually see, so it is not a nicety — without it every prop and
  // aeroplane is a black silhouette and the readability law has nothing to work with.
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(-900, 900, 2600);
  scene.add(fill);

  const fog = new THREE.Fog(0xffffff, 1, 2);
  scene.fog = fog;

  let pal = null;

  return {
    sun, hemi, fill, fog, amb,

    setPalette(p) {
      pal = p;
      const e = p.sun.elevDeg * D2R;
      const a = p.sun.azimDeg * D2R;
      const side = p.sun.screenX > 0.5 ? 1 : -1;
      const dir = new THREE.Vector3(
        Math.sin(a) * side * Math.cos(e),
        Math.max(0.12, Math.sin(e)),
        Math.cos(a) * Math.cos(e),
      ).normalize();
      sun.userData.dir = dir;
      sun.color.set(p.sun.col);
      sun.intensity = p.sun.intensity;
      sun.castShadow = p.sun.intensity > 0.45;

      hemi.color.set(p.hemi.sky);
      hemi.groundColor.set(p.hemi.ground);
      hemi.intensity = p.hemi.intensity * 1.25;
      amb.color.set(p.fog.col);
      amb.intensity = 0.10 + p.hemi.intensity * 0.10;

      // The fill is SKY BOUNCE, so it takes the sky's colour, not the sun's. Tinting it toward the
      // sun bathed every camera-facing surface in orange and turned props, enemies and terrain tan.
      fill.color.set(mix(p.sky.stops[1][1], p.sky.horizon, 0.30));
      // stronger the more backlit the sun is: cos(azim) < 0 means the key is behind the subject
      const back = Math.max(0, -Math.cos(a));
      fill.intensity = (0.55 + back * 0.85) * (0.55 + p.hemi.intensity * 0.5);

      fog.color.set(p.fog.col);
      scene.background = null;
    },

    /** Called every frame: park the shadow box on what is actually visible. */
    update(camPos, vw) {
      if (!pal) return;
      const dir = sun.userData.dir;
      const tx = camPos.x, ty = camPos.y - 180;
      sun.target.position.set(tx, ty, 0);
      sun.position.set(tx + dir.x * 3800, ty + dir.y * 3800, dir.z * 3800);
      sun.target.updateMatrixWorld();

      const halfW = vw * 0.56, halfH = 620;
      const sc2 = sun.shadow.camera;
      if (sc2.right !== halfW) {
        sc2.left = -halfW; sc2.right = halfW; sc2.top = halfH; sc2.bottom = -halfH;
        sc2.updateProjectionMatrix();
      }

      // near just in front of the gameplay plane; far out past the last background layer.
      const D = camPos.z;
      fog.near = D - 220;
      fog.far = D + 5400 / Math.max(0.35, pal.fog.k);
    },
  };
}

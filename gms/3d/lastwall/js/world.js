// LASTWALL — atmosphere: dusk sky dome, fog, blood sun, ground far below,
// writhing "infected sea" around the wall base, drifting ash, bloom composer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CFG, LITE } from './config.js';
import { mat } from './models.js';

export function buildWorld(scene, renderer, camera) {
  scene.fog = new THREE.Fog(CFG.fogColor, CFG.fogNear, CFG.fogFar);
  scene.background = new THREE.Color(CFG.fogColor);

  // sky dome (gradient via vertex colors on a big sphere, inside-out)
  const skyGeo = new THREE.SphereGeometry(900, 16, 10);
  const cols = [];
  const top = new THREE.Color(0x241420), mid = new THREE.Color(0x6e2a1a), low = new THREE.Color(0xc4502a);
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 900;
    const c = y > 0.25 ? top : y > 0 ? mid.clone().lerp(top, y / 0.25) : low.clone().lerp(mid, y + 1);
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  scene.add(sky);

  // blood sun
  const sun = new THREE.Mesh(new THREE.CircleGeometry(52, 24), new THREE.MeshBasicMaterial({ color: 0xff4a22, fog: false }));
  sun.position.set(-320, 110, -760); sun.lookAt(0, 60, 0);
  scene.add(sun);

  // lights
  const amb = new THREE.HemisphereLight(0xb08068, 0x3a2a20, 1.35);
  const dir = new THREE.DirectionalLight(0xffb070, 1.8);
  dir.position.set(-60, 90, -40);
  if (!LITE) {
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -70; dir.shadow.camera.right = 70;
    dir.shadow.camera.top = 70; dir.shadow.camera.bottom = -70;
    dir.shadow.camera.far = 300;
  }
  scene.add(amb, dir);

  // ground far below — dark scorched plain
  const gTex = groundTex();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshLambertMaterial({ map: gTex, color: 0x584238 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0;
  scene.add(ground);

  // infected sea: instanced swaying nubs hugging the wall base — a writhing carpet
  const seaN = LITE ? 260 : 700;
  const seaGeo = new THREE.BoxGeometry(0.9, 2.0, 0.9);
  const seaM = new THREE.MeshLambertMaterial({ color: 0x3c4030 });
  const sea = new THREE.InstancedMesh(seaGeo, seaM, seaN);
  sea.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const seaDat = [];
  for (let i = 0; i < seaN; i++) seaDat.push({ x: 0, z: 0, ph: Math.random() * 6.28, sp: 0.5 + Math.random(), h: 0.6 + Math.random() * 1.4 });
  scene.add(sea);

  // drifting ash
  const ashN = LITE ? 120 : 320;
  const ashPos = new Float32Array(ashN * 3);
  for (let i = 0; i < ashN; i++) { ashPos[i * 3] = (Math.random() - .5) * 160; ashPos[i * 3 + 1] = CFG.wallH + Math.random() * 26 - 4; ashPos[i * 3 + 2] = (Math.random() - .5) * 160; }
  const ashGeo = new THREE.BufferGeometry();
  ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
  const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({ color: 0xcbb090, size: 0.14, transparent: true, opacity: 0.7 }));
  scene.add(ash);

  // composer
  let composer = null;
  if (!LITE) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.82);
    composer.addPass(bloom);
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const world = {
    sky, sun, dir, composer, ash,
    tick(t, dt, px, pz) {
      sky.position.set(px, 0, pz); sun.position.set(px - 320, 110, pz - 760);
      ground.position.set(px, 0, pz);
      dir.position.set(px - 60, 90, pz - 40); dir.target.position.set(px, 0, pz); dir.target.updateMatrixWorld();
      // sea writhes near the player's wall stretch
      for (let i = 0; i < seaN; i++) {
        const d = seaDat[i];
        if (Math.abs(d.x - px) > 90 || Math.abs(d.z - pz) > 90 || d.x === 0) {
          const side = Math.random() < .5 ? -1 : 1;
          d.x = px + (Math.random() - .5) * 30 + side * (CFG.wallW / 2 + 2 + Math.random() * 22);
          d.z = pz - 20 - Math.random() * 120 + Math.random() * 60;
        }
        const y = Math.abs(Math.sin(t * d.sp + d.ph)) * d.h;
        p3.set(d.x, y, d.z); s3.set(1, 1 + y * .4, 1);
        m4.compose(p3, q, s3);
        sea.setMatrixAt(i, m4);
      }
      sea.instanceMatrix.needsUpdate = true;
      // ash drift
      const ap = ash.geometry.attributes.position.array;
      for (let i = 0; i < ashN; i++) {
        ap[i * 3] += dt * 1.6; ap[i * 3 + 1] -= dt * 0.5;
        if (ap[i * 3] > px + 80) ap[i * 3] = px - 80;
        if (ap[i * 3 + 1] < CFG.wallH - 6) ap[i * 3 + 1] = CFG.wallH + 24;
        if (Math.abs(ap[i * 3 + 2] - pz) > 90) ap[i * 3 + 2] = pz + (Math.random() - .5) * 120;
      }
      ash.geometry.attributes.position.needsUpdate = true;
    },
  };
  return world;
}

function groundTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#241812'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const v = 20 + Math.random() * 30;
    g.fillStyle = `rgba(${v + 20},${v},${v - 6},${0.25 + Math.random() * 0.3})`;
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 5, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

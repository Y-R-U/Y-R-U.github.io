// Stage 3 (company level 20) flagship dressing: swaying company banners, a holo ticker ring around the HQ podium,
// the VIP pad decal, and crowd light inside the arena dome (camera flashes + two sweeping show beams).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bannerTex, tickerTex, padTex, beamTex } from './textures.js';
import { blinkPoints } from './ambient.js';
import { LAYOUT, BSCALE } from './compound.js';

function bannerMesh(list) {
  const geos = list.map((b, i) => {
    const g = new THREE.PlaneGeometry(b.w, b.h, 1, 8);
    g.translate(0, -b.h / 2, 0);
    const n = g.attributes.position.count, sway = new Float32Array(n), ph = new Float32Array(n).fill(i * 1.7);
    for (let j = 0; j < n; j++) sway[j] = -g.attributes.position.getY(j) / b.h;
    g.setAttribute('sway', new THREE.BufferAttribute(sway, 1)); g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    g.rotateY(b.ry || 0); g.translate(b.x, b.y, b.z);
    return g;
  });
  const geo = mergeGeometries(geos); geos.forEach((g) => g.dispose());
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: bannerTex() }, uTime: { value: 0 } }, side: THREE.DoubleSide, transparent: false,
    vertexShader: `attribute float sway; attribute float phase; uniform float uTime; varying vec2 vUv; varying float vShade;
      void main(){ vUv = uv; vec3 p = position; float w = sin(uTime * 1.6 + phase + sway * 3.2);
        p += normal * w * 0.35 * sway; p.x += sin(uTime * 0.9 + phase) * 0.12 * sway;
        vShade = 0.85 + 0.25 * w * sway; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying float vShade;
      void main(){ vec4 c = texture2D(uMap, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb * vShade * 1.35, 1.0); }`,
  });
  mat.toneMapped = true;
  return new THREE.Mesh(geo, mat);
}

export function createFlagship(scene, compound, { stage }) {
  const group = new THREE.Group(); group.name = 'hub-flagship';
  const updaters = [];
  const noReflect = [];
  if (stage < 3) return { group, noReflect, update() {}, dispose() {} };
  scene.add(group);
  const S = BSCALE, fx = compound.fx;

  if (fx.banners?.length) {
    const banners = bannerMesh(fx.banners);
    group.add(banners);
    updaters.push((t) => { banners.material.uniforms.uTime.value = t; });
  }

  // scrolling holo ticker wrapped around the HQ shaft just above the podium
  const hq = LAYOUT.hq;
  const tk = tickerTex('NIGHTSHIFT CONTRACTING  //  LEAGUE RANK 01  //  NOW HIRING PILOTS  //  ', '#38e8ff');
  const tkTex = tk.clone(); tkTex.needsUpdate = true; tkTex.repeat.set(2, 1);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 9.6, 1.5, 56, 1, true), new THREE.MeshBasicMaterial({ map: tkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: new THREE.Color(1.6, 1.6, 1.6) }));
  ring.position.set(hq.x, 5.5 * S + 2.0, hq.z);
  group.add(ring); noReflect.push(ring);
  updaters.push((t) => { tkTex.offset.x = -t * 0.025; });

  // VIP pad decal
  if (fx.vipPad) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshBasicMaterial({ map: padTex('#ffd34d', 'VIP'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.5, 1.4, 1.2) }));
    pad.rotation.x = -Math.PI / 2; pad.position.copy(fx.vipPad).setY(fx.vipPad.y - 0.03);
    group.add(pad); noReflect.push(pad);
    updaters.push((t) => { pad.rotation.z = t * 0.12; });
  }

  // arena crowd: rapid camera flashes in the stands under the glass dome + two show beams sweeping from the crown
  const A = LAYOUT.arena, R = 9.5;
  const pts = [];
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2, rr = (0.55 + r() * 0.4) * R, y = 2.8 + r() * 2.2;
    const p = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr).multiplyScalar(S);
    p.applyAxisAngle(new THREE.Vector3(0, 1, 0), A.ry); p.x += A.x; p.z += A.z; p.s = 0.7 + r() * 0.8;
    pts.push(p);
  }
  const crowd = blinkPoints(pts, { size: 0.55, colors: [0xffffff, 0xff7ae0, 0x9ae8ff, 0xffffff, 0xffd080], rate: 2.6, duty: 0.07, base: 0.06 });
  group.add(crowd); noReflect.push(crowd);
  const cone = new THREE.CylinderGeometry(0.2, 1.8, 38, 12, 1, true); cone.translate(0, 19, 0);
  const uv = cone.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const c1 = cone.clone().rotateZ(0.22), c2 = cone.clone().rotateZ(-0.22); cone.dispose();
  const beams = new THREE.Mesh(mergeGeometries([c1, c2]), new THREE.MeshBasicMaterial({ map: beamTex(), color: new THREE.Color(0xff5ad8).multiplyScalar(0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  c1.dispose(); c2.dispose();
  beams.position.set(A.x, (4.4 + R) * S, A.z);
  group.add(beams); noReflect.push(beams);
  updaters.push((t, dt, px) => {
    crowd.material.uniforms.uTime.value = t; crowd.material.uniforms.uScale.value = px;
    beams.rotation.y = t * 0.35; beams.rotation.x = Math.sin(t * 0.5) * 0.1;
  });

  return {
    group, noReflect,
    update(t, dt, pxScale) { for (const u of updaters) u(t, dt, pxScale); },
    dispose() {
      group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      tkTex.dispose();
      group.removeFromParent();
    },
  };
}

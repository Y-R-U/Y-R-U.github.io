import * as THREE from 'three';
import { box, merge, onLayers, toLayer, BACKDROP_LAYER } from '../geo.js';
import { rng, crowdTex, windowTex, logoScreen, sloganScreen, bannerTex, dataPanelTex } from '../../fx/textures.js';
import { REFLECT_LAYER } from '../../fx/reflection.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Everything outside the barriers: sky, tiered stands with crowd impostors, the far VECTOR PROTOCOL tower and screens,
// floating data panels, the megacity skyline and flying craft.
export function buildBackdrop(engine, { iW, fz0, fz1, seed = 7 }) {
  const tier = engine.quality;
  const r = rng(seed * 31 + 5);
  const group = new THREE.Group();
  const updaters = [];
  const wx = iW / 2;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), eu = new THREE.Euler();
  const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

  // --- sky dome ---
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform float uTime; varying vec3 vD;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float y = vD.y;
        vec3 top = vec3(0.01, 0.015, 0.05), mid = vec3(0.04, 0.07, 0.22), hor = vec3(0.18, 0.28, 0.75);
        vec3 c = mix(mid, top, smoothstep(0.05, 0.6, y));
        c = mix(hor, c, smoothstep(-0.02, 0.16, y));
        vec2 uv = vec2(atan(vD.x, -vD.z) * 3.0, y * 8.0);
        float cl = n2(uv * 1.3 + vec2(uTime * 0.01, 0.0)) * 0.6 + n2(uv * 3.1) * 0.4;
        c += vec3(0.12, 0.08, 0.35) * smoothstep(0.45, 0.85, cl) * smoothstep(0.5, 0.05, y) * 0.8;
        c += vec3(0.25, 0.1, 0.45) * exp(-abs(y - 0.03) * 22.0) * 0.5;
        vec2 sg = floor(vec2(atan(vD.x, -vD.z), y) * 260.0);
        float st = step(0.9965, h21(sg)) * smoothstep(0.12, 0.4, y) * (0.6 + 0.4 * sin(uTime * 2.0 + h21(sg + 3.0) * 30.0));
        c += vec3(0.8, 0.9, 1.0) * st;
        // battle-8: below the horizon is the stadium floor under the stands, not more glowing sky (the D26 intro and landscape see it)
        c = mix(c, vec3(0.012, 0.02, 0.06), smoothstep(-0.015, -0.09, y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  group.add(sky);
  updaters.push((dt, t) => { skyMat.uniforms.uTime.value = t; });

  // --- stands ---
  const standMat = new THREE.MeshStandardMaterial({ color: 0x0b1122, metalness: 0.7, roughness: 0.5, envMapIntensity: 0.35 });
  const standG = [], fasciaG = [[], [], []], crowd = [];
  const TIERS = 11, tierD = 1.35, tierH = 0.95, zS0 = fz0 + 2, zS1 = fz1 - 16;
  for (const s of [-1, 1]) {
    for (let k = 0; k < TIERS; k++) {
      const x = s * (wx + 1.4 + k * tierD), top = 1.3 + k * tierH;
      standG.push(box(tierD, top, zS0 - zS1, x, top / 2, (zS0 + zS1) / 2));
      fasciaG[k % 3].push(box(0.06, 0.07, zS0 - zS1, x - s * tierD / 2, top + 0.01, (zS0 + zS1) / 2));
      for (let z = zS0 - 1.6; z > zS1; z -= 3.2) crowd.push({ x: x + s * 0.1, y: top, z, ry: -s * Math.PI / 2, w: 3.2, d: k / TIERS * 0.55 });
    }
    // aisle stairs: lit vertical seams across the tiers
    for (let z = zS0 - 4; z > zS1; z -= 9) {
      fasciaG[2].push(box(TIERS * tierD, 0.05, 0.06, s * (wx + 1.4 + (TIERS - 1) * tierD / 2), 0.0, z).rotateZ(0)
        .translate(0, 0, 0));
    }
  }
  // far end stands: a tall bank of tiers facing the board (seen near-level by the backdrop camera)
  const FT = 7;
  for (let k = 0; k < FT; k++) {
    const z = fz1 - 1.8 - k * 1.3, top = 1.6 + k * 0.75;
    const xb = wx + 1.4 + TIERS * tierD;
    standG.push(box(xb * 2, top, 1.3, 0, top / 2, z));
    if (k % 3 === 0) fasciaG[k % 2 ? 2 : 0].push(box(xb * 2, 0.06, 0.06, 0, top + 0.01, z + 0.66));
    for (let x = -xb + 1.4; x < xb; x += 2.8) crowd.push({ x, y: top, z: z + 0.1, ry: 0, w: 2.8, d: 0.15 + k / FT * 0.4 });
  }
  const stands = new THREE.Mesh(merge(standG), standMat);
  stands.receiveShadow = false;
  group.add(stands);
  const fasciaCols = [hdr(0x3fb8ff, 1.6), hdr(0x4a5cff, 1.2), hdr(0xff4fd8, 1.3)];
  fasciaG.forEach((list, i) => {
    if (!list.length) return;
    const m = onLayers(new THREE.Mesh(merge(list), new THREE.MeshBasicMaterial({ color: fasciaCols[i] })), REFLECT_LAYER);
    group.add(m);
  });

  // crowd impostors
  const nCrowd = Math.round(crowd.length * Math.min(1, tier.crowd + 0.15));
  const cTex = crowdTex();
  // impostor rows: silhouettes from the atlas, per-person hop (more when hyped), flickering light sticks / phones,
  // depth haze per tier, and a stadium wave that runs round the stands on big moments (hype / wave below)
  const crowdMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: cTex }, uTime: { value: 0 }, uHype: { value: 0 }, uWaveX: { value: -9 }, uWaveA: { value: 0 },
      uHaze: { value: new THREE.Color(0.05, 0.08, 0.22) }, uZc: { value: (fz0 + fz1) / 2 } },
    vertexShader: `attribute vec4 aInfo; uniform float uZc; varying vec2 vUv; varying vec4 vInfo; varying vec3 vC; varying float vS;
      void main(){
        vUv = uv; vInfo = aInfo; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vS = atan(w.x, -(w.z - uZc) + 6.0);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uTime, uHype, uWaveX, uWaveA; uniform vec3 uHaze;
      varying vec2 vUv; varying vec4 vInfo; varying vec3 vC; varying float vS;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float row = vInfo.x;
        float ux = vUv.x * 0.25 + vInfo.y;
        float h = h21(vec2(floor(ux * 36.0), row + vInfo.z * 13.0));
        float wave = exp(-pow((vS - uWaveX) * 3.0, 2.0)) * uWaveA;
        float hop = max(0.0, sin(uTime * (4.0 + h * 5.0) + h * 30.0)) * (0.015 + uHype * 0.12) * step(0.35, h) + wave * 0.28;
        vec2 uv = vec2(fract(ux), (row + clamp(vUv.y - hop, 0.0, 1.0)) / 4.0);
        vec4 t = texture2D(uTex, uv);
        if (t.r < 0.5) discard;
        vec3 c = vC * (0.02 + t.b * 0.07) * (1.0 + wave * 2.0 + uHype * 0.6);
        vec3 sc = h < 0.3 ? vec3(0.4, 1.0, 2.2) : h < 0.55 ? vec3(2.0, 0.5, 1.8) : h < 0.75 ? vec3(1.8, 1.9, 2.2) : vec3(2.2, 1.4, 0.4);
        float fl = 0.5 + 0.5 * sin(uTime * (2.0 + h * 7.0) + h * 40.0);
        float sway = step(0.6, fract(uTime * (0.4 + h) + h * 9.0));
        c += sc * t.g * (0.35 + 0.65 * fl) * (2.4 + uHype * 3.0 + wave * 4.0) * mix(1.0, sway, 0.25);
        c = mix(c, uHaze, vInfo.w);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const crowdGeo = new THREE.PlaneGeometry(1, 1.25);
  crowdGeo.translate(0, 0.62, 0);
  const crowdMesh = new THREE.InstancedMesh(crowdGeo, crowdMat, nCrowd);
  const info = new Float32Array(nCrowd * 4);
  crowdMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nCrowd * 3), 3);
  const tints = [0x6fa8ff, 0x7a7cff, 0x5f8cff, 0x5fe0ff, 0x8090ff, 0xb070ff, 0x6fa8ff];
  const tc = new THREE.Color();
  const pick = crowd.slice().sort(() => r() - 0.5).slice(0, nCrowd);
  pick.forEach((c, i) => {
    m4.compose(pv.set(c.x, c.y, c.z), q.setFromEuler(eu.set(0, c.ry, 0)), sc.set(c.w, 1, 1));
    crowdMesh.setMatrixAt(i, m4);
    crowdMesh.setColorAt(i, tc.set(tints[(r() * tints.length) | 0]).multiplyScalar(1.2 + r() * 0.8));
    info[i * 4] = (r() * 4) | 0; info[i * 4 + 1] = r(); info[i * 4 + 2] = r(); info[i * 4 + 3] = c.d ?? 0.3;
  });
  crowdGeo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  group.add(crowdMesh);
  const hype = { k: 0, wave: -1 };
  updaters.push((dt, t) => {
    const u = crowdMat.uniforms;
    u.uTime.value = t;
    hype.k = Math.max(0, hype.k - dt * 0.35); u.uHype.value = Math.min(1, hype.k);
    if (hype.wave >= 0) { hype.wave += dt; u.uWaveX.value = -1.9 + hype.wave * 1.5; u.uWaveA.value = Math.min(1, hype.wave * 3) * Math.min(1, (2.6 - hype.wave) * 2); if (hype.wave > 2.6) { hype.wave = -1; u.uWaveA.value = 0; } }
  });

  // upper canopy rings over the side stands
  const canopyG = [], canopyLights = [];
  for (const s of [-1, 1]) {
    const x = s * (wx + 1.4 + TIERS * tierD + 1.5);
    canopyG.push(box(3.2, 22, zS0 - zS1, x, 11, (zS0 + zS1) / 2));
    canopyG.push(box(9, 0.8, zS0 - zS1 + 4, x - s * 3.5, 18.5, (zS0 + zS1) / 2));
    canopyLights.push(box(0.12, 0.12, zS0 - zS1 + 4, x - s * 8, 18.1, (zS0 + zS1) / 2));
    canopyLights.push(box(0.1, 0.1, zS0 - zS1, x - s * 1.65, 12.8, (zS0 + zS1) / 2));
    canopyLights.push(box(0.1, 0.1, zS0 - zS1, x - s * 1.65, 6.2, (zS0 + zS1) / 2));
  }
  group.add(new THREE.Mesh(merge(canopyG), standMat));
  group.add(new THREE.Mesh(merge(canopyLights), new THREE.MeshBasicMaterial({ color: hdr(0x4fc0ff, 3) })));

  // --- league screen on its tower, flanked by lit pylons ---
  const tz = fz1 - 16.5;
  const sy0 = 7.0, sw = 16, sh = 8.6;
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x0d1428, metalness: 0.8, roughness: 0.45, envMapIntensity: 0.35 });
  const tower = new THREE.Mesh(merge([
    box(sw + 1.2, sh + 1.2, 1.2, 0, sy0 + sh / 2, tz - 0.7),        // screen housing
    box(sw + 4, 1.6, 2.4, 0, sy0 + sh + 0.9, tz - 0.6),            // crown
    box(sw + 2.8, sy0, 2, 0, sy0 / 2, tz - 0.4),                   // plinth
    box(1.6, sy0 + sh + 3.5, 1.8, -(sw / 2 + 1.9), (sy0 + sh + 3.5) / 2, tz - 0.2), // pylons
    box(1.6, sy0 + sh + 3.5, 1.8, sw / 2 + 1.9, (sy0 + sh + 3.5) / 2, tz - 0.2),
    box(24, 16, 2, 0, 8, tz - 4),                                  // back mass
  ]), towerMat);
  onLayers(tower, REFLECT_LAYER);
  group.add(tower);
  const towerLights = new THREE.Mesh(merge([
    box(0.14, sh + 1.2, 0.14, -(sw / 2 + 0.7), sy0 + sh / 2, tz - 0.05), box(0.14, sh + 1.2, 0.14, sw / 2 + 0.7, sy0 + sh / 2, tz - 0.05),
    box(sw + 1.4, 0.12, 0.14, 0, sy0 - 0.05, tz - 0.05), box(sw + 4, 0.12, 0.14, 0, sy0 + sh + 0.12, tz + 0.65),
    box(0.16, sy0 + sh + 3, 0.16, -(sw / 2 + 1.1), (sy0 + sh + 3) / 2, tz + 0.75), box(0.16, sy0 + sh + 3, 0.16, sw / 2 + 1.1, (sy0 + sh + 3) / 2, tz + 0.75),
    box(0.16, sy0 + sh + 3, 0.16, -(sw / 2 + 2.7), (sy0 + sh + 3) / 2, tz + 0.75), box(0.16, sy0 + sh + 3, 0.16, sw / 2 + 2.7, (sy0 + sh + 3) / 2, tz + 0.75),
    box(sw + 2.8, 0.1, 0.1, 0, sy0, tz + 0.62),
  ]), new THREE.MeshBasicMaterial({ color: hdr(0x55c8ff, 3.2) }));
  onLayers(towerLights, REFLECT_LAYER);
  group.add(towerLights);
  const screenMat = (map, k = 1.6) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(k, k, k), toneMapped: true });
  const logoMap = logoScreen(768, 416);
  const bigScreen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMat(logoMap, 1.6));
  bigScreen.position.set(0, sy0 + sh / 2, tz - 0.08);
  onLayers(bigScreen, REFLECT_LAYER);
  group.add(bigScreen);
  // pylon emblem panels
  const emb = bannerTex(128, 256, '#4fd0ff');
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), screenMat(emb, 1.4));
    m.position.set(sx * (sw / 2 + 1.9), sy0 + 1.2, tz + 0.72); onLayers(m, REFLECT_LAYER); group.add(m);
  }

  // slogan screens on the far corners, angled toward the board
  const sl1 = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), screenMat(sloganScreen(['STRONGER', 'SMARTER', 'TOGETHER']), 1.4));
  sl1.position.set(-(wx - 0.5), 6.4, fz1 - 3.2); sl1.rotation.y = 0.25;
  const sl2 = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), screenMat(sloganScreen(['SQUAD', 'STRATEGY', 'VICTORY']), 1.4));
  sl2.position.set(wx - 0.5, 6.4, fz1 - 3.2); sl2.rotation.y = -0.25;
  for (const m of [sl1, sl2]) { onLayers(m, REFLECT_LAYER); group.add(m); }
  const slFrame = new THREE.Mesh(merge([
    box(6.8, 4.0, 0.4, 0, 0, -0.25), box(0.5, 4.6, 0.5, 0, -4.3, -0.3),
  ].map((g, i) => g)), towerMat);
  for (const m of [sl1, sl2]) { const f = slFrame.clone(); f.position.copy(m.position); f.rotation.copy(m.rotation); group.add(f); }

  // pink banners
  const bTex = bannerTex();
  const banners = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 4.2), screenMat(bTex, 1.5), 6);
  [[-(sw / 2 + 4.4), sy0 + 2.2, tz + 0.6, 0], [sw / 2 + 4.4, sy0 + 2.2, tz + 0.6, 0], [-(wx + 3.2), 7.5, fz1 - 2.0, 0.35], [wx + 3.2, 7.5, fz1 - 2.0, -0.35],
    [-(wx + 6), 11, fz1 - 6, 0.5], [wx + 6, 11, fz1 - 6, -0.5]]
    .forEach(([x, y, z, ry], i) => { m4.compose(pv.set(x, y, z), q.setFromEuler(eu.set(0, ry, 0)), sc.set(1, 1, 1)); banners.setMatrixAt(i, m4); });
  onLayers(banners, REFLECT_LAYER);
  group.add(banners);

  // floating data panels above the barriers. battle-8: one draw (texture atlas + per-panel bob phase in the vertex shader); they were
  // 6 separate meshes, which is most of the extra draws landscape made (it sees all of them)
  const panelDefs = [[-(wx - 0.6), 3.9, -2, 0.9], [wx - 0.6, 3.9, -6, -0.9], [-(wx - 0.6), 4.4, -11, 0.9], [wx - 0.6, 4.2, 1.5, -0.9]];
  if (tier.holoDetail > 0.5) panelDefs.push([-(wx + 6), 9, -14, 0.6], [wx + 6, 9.5, -12, -0.6]);
  {
    const n = panelDefs.length, atlas = document.createElement('canvas');
    atlas.width = 256; atlas.height = 160 * n;
    const ac = atlas.getContext('2d'), PG = [];
    panelDefs.forEach(([x, y, z, ry], i) => {
      const t = dataPanelTex(seed + i, 256, 160, i % 2 ? '#ff7ad8' : '#5cd0ff');
      ac.drawImage(t.image, 0, 160 * i); t.dispose();
      const g = new THREE.PlaneGeometry(2.2, 1.4);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, (uv.getY(k) + (n - 1 - i)) / n);
      g.rotateY(ry); g.translate(x, y, z);
      g.setAttribute('aPh', new THREE.Float32BufferAttribute(new Array(uv.count).fill(r() * 6), 1));
      PG.push(g);
    });
    const at = new THREE.CanvasTexture(atlas); at.colorSpace = THREE.SRGBColorSpace; at.anisotropy = 4;
    const pm = new THREE.MeshBasicMaterial({ map: at, color: new THREE.Color(1.4, 1.4, 1.4),
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const uT = { value: 0 };
    pm.onBeforeCompile = (sh) => {
      sh.uniforms.uT = uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPh; uniform float uT;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sin(uT * 0.8 + aPh) * 0.12;');
    };
    pm.customProgramCacheKey = () => 'vp-panels';
    const pmesh = new THREE.Mesh(mergeGeometries(PG, false), pm);
    for (const g of PG) g.dispose();
    group.add(pmesh);
    updaters.push((dt, t) => { uT.value = t; });
  }

  // --- skyline ---
  const wTex = windowTex();
  const nB = Math.round(220 * tier.skyline);
  const skyMatB = new THREE.ShaderMaterial({
    uniforms: { uWin: { value: wTex }, uTime: { value: 0 }, uHaze: { value: new THREE.Color(0.15, 0.25, 0.68) } },
    vertexShader: `attribute vec3 aB; varying vec2 vWin; varying vec3 vB; varying float vSide; varying float vDist; varying float vH; varying float vWorldY;
      void main(){
        vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vSide = 1.0 - abs(normal.y);
        vWin = uv * (abs(normal.x) > 0.5 ? s.zy : s.xy) / vec2(0.9, 1.3) + aB.xy * 7.0;
        vB = aB; vH = uv.y;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDist = length(w.xz - cameraPosition.xz); vWorldY = w.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform sampler2D uWin; uniform float uTime; uniform vec3 uHaze; varying vec2 vWin; varying vec3 vB; varying float vSide; varying float vDist; varying float vH; varying float vWorldY;
      void main(){
        vec3 base = vec3(0.02, 0.03, 0.07);
        vec4 w = texture2D(uWin, vWin / vec2(32.0, 51.2));
        vec3 wc = mix(vec3(0.35, 0.65, 1.4), vec3(1.4, 0.9, 0.5), step(0.82, vB.z));
        if (vB.z > 0.93) wc = vec3(1.2, 0.4, 1.3);
        vec3 c = base + wc * w.r * (0.25 + 0.75 * w.g) * vSide * 1.5;
        c += vec3(0.3, 0.7, 1.6) * smoothstep(0.985, 1.0, vH) * vSide * 1.5;
        float f = clamp((vDist - 60.0) / 220.0, 0.0, 0.92);
        c = mix(c, uHaze, f * 0.8);
        c = mix(c, uHaze * 1.6, smoothstep(40.0, 0.0, vWorldY) * 0.55 * f); // low horizon mist
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const beacons = [];
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const bMesh = new THREE.InstancedMesh(bGeo, skyMatB, nB);
  const bInfo = new Float32Array(nB * 3);
  for (let i = 0; i < nB; i++) {
    // three depth bands: mid (crisp, lit), far (hazy, taller), very far (silhouettes against the horizon glow)
    const band = i % 3;
    const a = (r() - 0.5) * Math.PI * (band ? 1.1 : 1.35);
    const d = band === 0 ? 70 + r() * 70 : band === 1 ? 150 + r() * 120 : 290 + r() * 150;
    const x = Math.sin(a) * d * 1.1, z = fz1 - 20 - Math.cos(a) * d;
    const k = band === 0 ? 1 : band === 1 ? 1.7 : 2.6;
    const w = (4 + r() * 8) * k * 0.7, h = (22 + r() * r() * 90) * k + (Math.abs(a) < 0.45 ? 20 * k : 0), dd = (4 + r() * 8) * k * 0.7;
    if (h > 120 && beacons.length < 40) beacons.push([x, h - 2, z, k]);
    m4.compose(pv.set(x, -2, z), q.setFromEuler(eu.set(0, r() * 0.6, 0)), sc.set(w, h, dd));
    bMesh.setMatrixAt(i, m4);
    bInfo[i * 3] = r(); bInfo[i * 3 + 1] = r(); bInfo[i * 3 + 2] = r();
  }
  bGeo.setAttribute('aB', new THREE.InstancedBufferAttribute(bInfo, 3));
  group.add(bMesh);
  // blinking aviation beacons + glowing crowns on the tallest towers (one draw)
  if (beacons.length) {
    const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), beacons.length);
    const bc = new THREE.Color();
    beacons.forEach(([x, y, z, k], i) => { m4.compose(pv.set(x, y, z), q.identity(), sc.setScalar(0.9 * k)); bm.setMatrixAt(i, m4); bm.setColorAt(i, bc.set(i % 3 ? 0xff3355 : 0x66ddff).multiplyScalar(4)); });
    group.add(bm);
    const base = beacons.map((_, i) => (i % 3 ? new THREE.Color(0xff3355) : new THREE.Color(0x66ddff)).multiplyScalar(4));
    updaters.push((dt, t) => {
      for (let i = 0; i < beacons.length; i++) { const on = Math.sin(t * 2.4 + i * 1.7) > 0.4 ? 1 : 0.08; bm.setColorAt(i, bc.copy(base[i]).multiplyScalar(on)); }
      bm.instanceColor.needsUpdate = true;
    });
  }
  // sweeping searchlights from behind the stands
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(0.25, 0.55, 1.2) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.5) * smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x); gl_FragColor = vec4(uColor * a * 0.5, 1.0); }`,
  });
  const lights = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.CylinderGeometry(2.2, 0.25, 90, 10, 1, true); g.translate(0, 45, 0);
    const m = new THREE.Mesh(g, beamMat);
    m.position.set((i < 2 ? -1 : 1) * (14 + (i % 2) * 9), 9, fz1 - 14 - (i % 2) * 6);
    m.userData.ph = i * 1.9; lights.push(m); group.add(m);
  }
  updaters.push((dt, t) => { for (const m of lights) { m.rotation.z = Math.sin(t * 0.25 + m.userData.ph) * 0.45 + (m.position.x < 0 ? 0.25 : -0.25); m.rotation.x = -0.35 + Math.cos(t * 0.2 + m.userData.ph) * 0.12; } });

  // halo platforms / rings in the skyline (the ref's saucer decks)
  const ringMat = new THREE.MeshBasicMaterial({ color: hdr(0x58c8ff, 2.2) });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x0f1630, metalness: 0.8, roughness: 0.4 });
  const deckG = [], ringG = [];
  [[-48, 34, fz1 - 60, 14], [52, 28, fz1 - 75, 18], [8, 52, fz1 - 140, 22], [-90, 40, fz1 - 120, 16]].forEach(([x, y, z, rad]) => {
    const deck = new THREE.CylinderGeometry(rad, rad * 0.6, 2.5, 32); deck.translate(x, y, z); deckG.push(deck);
    const stem = new THREE.CylinderGeometry(rad * 0.18, rad * 0.25, y + 2, 12); stem.translate(x, (y - 2) / 2, z); deckG.push(stem);
    const ring = new THREE.TorusGeometry(rad * 1.02, 0.35, 6, 48); ring.rotateX(Math.PI / 2); ring.translate(x, y + 0.6, z); ringG.push(ring);
  });
  group.add(new THREE.Mesh(merge(deckG), deckMat), new THREE.Mesh(merge(ringG), ringMat));

  // --- flying craft ---
  const nC = tier.craft || 0;
  const craft = [];
  if (nC) {
    const hull = merge([box(2.4, 0.5, 5, 0, 0, 0), box(6, 0.18, 1.6, 0, 0, 0.6), box(0.9, 0.6, 1.4, 0, 0.45, -0.6)]);
    const cMesh = new THREE.InstancedMesh(hull, new THREE.MeshStandardMaterial({ color: 0x1a2340, metalness: 0.8, roughness: 0.35 }), nC);
    const glow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), nC * 2);
    for (let i = 0; i < nC; i++) {
      craft.push({ y: 16 + r() * 22, z: fz1 - 15 - r() * 60, sp: (r() < 0.5 ? -1 : 1) * (6 + r() * 8), x: (r() - 0.5) * 160, s: 0.8 + r() * 0.8 });
      glow.setColorAt(i * 2, hdr(0x66ccff, 6)); glow.setColorAt(i * 2 + 1, hdr(i % 2 ? 0xff5a8a : 0x66ccff, 6));
    }
    group.add(cMesh, glow);
    updaters.push((dt) => {
      craft.forEach((c, i) => {
        c.x += c.sp * dt;
        if (c.x > 110) c.x = -110; if (c.x < -110) c.x = 110;
        const yaw = c.sp > 0 ? Math.PI / 2 : -Math.PI / 2;
        m4.compose(pv.set(c.x, c.y, c.z), q.setFromEuler(eu.set(0, yaw, 0)), sc.setScalar(c.s)); cMesh.setMatrixAt(i, m4);
        const back = c.sp > 0 ? -1 : 1;
        m4.compose(pv.set(c.x + back * 2.6 * c.s, c.y, c.z), q.identity(), sc.setScalar(c.s)); glow.setMatrixAt(i * 2, m4);
        m4.compose(pv.set(c.x - back * 2.2 * c.s, c.y + 0.1, c.z), q.identity(), sc.setScalar(c.s * 0.6)); glow.setMatrixAt(i * 2 + 1, m4);
      });
      cMesh.instanceMatrix.needsUpdate = true; glow.instanceMatrix.needsUpdate = true;
    });
  }

  toLayer(group, BACKDROP_LAYER);
  return { group, update(dt, t) { for (const u of updaters) u(dt, t); }, bigScreen, sloganScreens: [sl1, sl2],
    // crowd reaction: hype(k) = louder/jumpier for a few seconds; wave() = a stadium wave round the stands
    hype(k = 0.5) { hype.k = Math.min(1.5, hype.k + k); },
    wave() { if (hype.wave < 0) hype.wave = 0; hype.k = Math.max(hype.k, 0.8); } };
}

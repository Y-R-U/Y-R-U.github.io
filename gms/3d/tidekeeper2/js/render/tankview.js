/* ═══════════════════════════════════════════════════════════════════════════
   THE TANK
   Glass, water, substrate, the light that comes through the surface, and the
   things drifting in it. Everything underwater is lit by one overhead fixture
   and tinted by per-channel absorption, which is what makes a photograph of a
   real tank look the way it does.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { clamp, lerp, rr, rnd, fbm, TAU } from '../util.js';
import { CFG } from '../config.js';
import { photo, derivedNormal, causticTile, dotSprite, sandFallback, gravelFallback } from './textures.js';
import { useWaterFog, FISH_U } from './fish.js';

export const TANK_U = {
  uTime:    { value: 0 },
  uNight:   { value: 0 },
  uCaustic: { value: 1.0 },
  uAlgae:   { value: 0.0 },
  uMurk:    { value: 0.0 },
  uWater:   { value: new THREE.Color(0x1a6b80) },
  uSurfaceY:{ value: 3.0 },
  uLamp:    { value: 1.0 },
};

const CAUSTIC_SAMPLE = `
  float tkCaustic(vec2 p){
    float a = texture2D(uCaus, p * 0.16 + vec2(uTime * 0.014, uTime * 0.010)).r;
    float b = texture2D(uCaus, p * 0.068 - vec2(uTime * 0.009, uTime * 0.013)).r;
    float c = texture2D(uCaus, p * 0.30 + vec2(uTime * -0.019, uTime * 0.016)).r;
    float n = a * b * 5.2 + a * 0.55 + c * 0.35;
    return pow(clamp(n, 0.0, 2.4), 1.35);
  }`;

export class TankView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.caus = causticTile(256);
    this.dot = dotSprite(64);
    this.parts = [];
    this.dims = [4, 2.4, 2.2];
    this.buildSnow();
    this.buildBubbles();
    this.buildShadows();
    this.buildFood();
  }

  clear() {
    for (const o of this.parts) {
      this.group.remove(o);
      o.traverse?.(c => { if (c.geometry) c.geometry.dispose(); });
    }
    this.parts = [];
  }

  /* ── build the box ────────────────────────────────────────────────────── */
  build(dims, water, substrate = 'sand') {
    this.clear();
    this.dims = dims.slice(); this.water = water;
    const [W, H, D] = dims;
    const add = o => { this.group.add(o); this.parts.push(o); return o; };
    TANK_U.uSurfaceY.value = H;
    this.snow.material.uniforms.uBox.value.set(W - 0.2, H - 0.2, D - 0.2);

    /* ── substrate ──────────────────────────────────────────────────────── */
    const sg = new THREE.PlaneGeometry(W, D, 56, 34);
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i);
      const h = (fbm(x * 0.8 + 11, y * 0.8 + 5, 3) - 0.5) * 0.20 + (fbm(x * 2.4, y * 2.4, 2) - 0.5) * 0.06;
      const edge = clamp((W * 0.5 - Math.abs(x)) / 0.6, 0, 1) * clamp((D * 0.5 - Math.abs(y)) / 0.5, 0, 1);
      sp.setZ(i, h * edge + 0.07 + (1 - edge) * 0.03);
    }
    sg.computeVertexNormals();
    const isSand = substrate === 'sand';
    const cmap = photo(isSand ? 'sand' : 'gravel',
      { repeat: Math.max(2, Math.round(W / 2.4)), fallback: isSand ? sandFallback : gravelFallback });
    const sandMat = new THREE.MeshStandardMaterial({
      map: cmap, normalMap: derivedNormal(cmap, isSand ? 1.1 : 2.2, Math.max(2, Math.round(W / 2.4))),
      color: isSand ? 0x6e6759 : 0x494540, roughness: 0.96, metalness: 0.0,
    });
    sandMat.onBeforeCompile = sh => {
      sh.uniforms.uTime = TANK_U.uTime; sh.uniforms.uNight = TANK_U.uNight;
      sh.uniforms.uCaustic = TANK_U.uCaustic; sh.uniforms.uAlgae = TANK_U.uAlgae;
      sh.uniforms.uCaus = { value: this.caus };
      useWaterFog(sh);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vWP; uniform sampler2D uCaus;
        uniform float uTime, uNight, uCaustic, uAlgae;\n${CAUSTIC_SAMPLE}\n` + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        float caus = tkCaustic(vWP.xz) * uCaustic * (1.0 - uNight * 0.75);
        gl_FragColor.rgb *= mix(0.62, 1.18, smoothstep(0.0, 0.55, caus));
        gl_FragColor.rgb += vec3(0.44, 0.76, 0.90) * clamp(caus, 0.0, 2.0) * 0.42;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.19, 0.32, 0.15), uAlgae * 0.45);
        gl_FragColor.rgb *= 1.0 - uNight * 0.40;`);
    };
    const sand = add(new THREE.Mesh(sg, sandMat));
    sand.rotation.x = -Math.PI / 2;
    this.sand = sand;

    /* scattered pebbles so the floor is not one smooth sheet */
    const peb = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: isSand ? 0x776f61 : 0x4e4a44, roughness: 0.95 }), 70);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < 70; i++) {
      const sc = rr(0.012, 0.034);
      v.set(rr(-W * 0.46, W * 0.46), 0.05, rr(-D * 0.44, D * 0.44));
      q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
      s.set(sc, sc * 0.55, sc);
      peb.setMatrixAt(i, m4.compose(v, q, s));
    }
    peb.instanceMatrix.needsUpdate = true;
    peb.material.onBeforeCompile = useWaterFog;
    add(peb);

    /* ── back and side panels ───────────────────────────────────────────── */
    const backTex = photo('backdrop', { repeat: 1, fallback: () => {
      const c = document.createElement('canvas'); c.width = 8; c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, water === 'sw' ? '#3f7ea8' : '#3a7690');
      grd.addColorStop(0.55, water === 'sw' ? '#1b4568' : '#1a4150');
      grd.addColorStop(1, '#070d14');
      g.fillStyle = grd; g.fillRect(0, 0, 8, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    } });
    const wallMat = new THREE.MeshStandardMaterial({
      map: backTex, color: water === 'sw' ? 0x14344e : 0x143038, roughness: 1, side: THREE.FrontSide });
    wallMat.onBeforeCompile = sh => {
      sh.uniforms.uTime = TANK_U.uTime; sh.uniforms.uNight = TANK_U.uNight;
      sh.uniforms.uCaustic = TANK_U.uCaustic; sh.uniforms.uCaus = { value: this.caus };
      useWaterFog(sh);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vWP; uniform sampler2D uCaus; uniform float uTime, uNight, uCaustic;
        ${CAUSTIC_SAMPLE}\n` + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        float fade = smoothstep(0.0, ${(H * 0.95).toFixed(2)}, vWP.y);
        float c = tkCaustic(vec2(vWP.x, vWP.y * 1.7));
        gl_FragColor.rgb += vec3(0.26,0.48,0.58) * c * uCaustic * (1.0 - fade*0.6) * (1.0 - uNight*0.8) * 0.16;
        gl_FragColor.rgb *= 0.50 + 0.55 * (1.0 - fade);
        gl_FragColor.rgb *= 1.0 - uNight * 0.35;`);
    };
    const back = add(new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat));
    back.position.set(0, H * 0.5, -D / 2 + 0.015);
    for (const sgn of [1, -1]) {
      const side = add(new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat));
      side.position.set(sgn * (W / 2 - 0.015), H * 0.5, 0);
      side.rotation.y = -sgn * Math.PI / 2;
    }

    /* ── the surface, seen from underneath ──────────────────────────────── */
    const surf = add(new THREE.Mesh(new THREE.PlaneGeometry(W - 0.05, D - 0.05, 40, 26), new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      uniforms: { uTime: TANK_U.uTime, uNight: TANK_U.uNight, uWater: TANK_U.uWater,
                  uCaustic: TANK_U.uCaustic, uCaus: { value: this.caus } },
      vertexShader: `
        uniform float uTime; varying vec2 vU; varying vec3 vWP; varying vec3 vV;
        void main(){
          vU = uv; vec3 p = position;
          p.z += sin(p.x * 3.4 + uTime * 1.5) * 0.020 + cos(p.y * 4.6 - uTime * 1.1) * 0.016
               + sin((p.x + p.y) * 7.0 + uTime * 2.2) * 0.007;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWP = wp.xyz; vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime, uNight, uCaustic; uniform vec3 uWater; uniform sampler2D uCaus;
        varying vec2 vU; varying vec3 vWP; varying vec3 vV;
        ${CAUSTIC_SAMPLE}
        void main(){
          float c = tkCaustic(vWP.xz * 1.6);
          vec3 col = uWater * (0.55 + 0.45 * c);
          col += vec3(0.72,0.90,1.0) * clamp(c,0.0,2.0) * 0.26 * uCaustic * (1.0 - uNight*0.7);
          /* looked at from below, a water surface turns into a mirror at a
             shallow angle — the single most recognisable thing about it */
          float graze = pow(1.0 - clamp(abs(vV.y), 0.0, 1.0), 3.0);
          col = mix(col, uWater * 1.5 + vec3(0.05,0.10,0.14), graze * 0.75);
          col = mix(col, vec3(0.030,0.075,0.175), uNight * 0.9);
          float edge = smoothstep(0.0,0.05,vU.x) * smoothstep(1.0,0.95,vU.x) *
                       smoothstep(0.0,0.05,vU.y) * smoothstep(1.0,0.95,vU.y);
          gl_FragColor = vec4(col, (0.55 * edge + 0.30) * (1.0 - uNight*0.25));
        }`,
    })));
    surf.rotation.x = -Math.PI / 2; surf.position.y = H;
    surf.renderOrder = 3;

    /* ── shafts of light through the surface ────────────────────────────── */
    this.rays = new THREE.Group(); add(this.rays);
    const rayMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: TANK_U.uTime, uNight: TANK_U.uNight, uCaustic: TANK_U.uCaustic },
      vertexShader: `attribute float aSeed; varying vec2 vU; varying float vS;
        void main(){ vU = uv; vS = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vU; varying float vS; uniform float uTime, uNight, uCaustic;
        void main(){
          float across = smoothstep(0.0,0.46,vU.x) * smoothstep(1.0,0.54,vU.x);
          across = pow(across, 1.6);
          float down = pow(1.0 - vU.y, 1.35);
          float flick = 0.55 + 0.45 * sin(uTime*0.5 + vS*21.0) * sin(uTime*0.21 + vS*9.0);
          float a = across * down * flick * 0.085 * uCaustic * (1.0 - uNight*0.88);
          gl_FragColor = vec4(vec3(0.66,0.88,1.0), a);
        }`,
    });
    const NR = CFG.RAYS;
    for (let i = 0; i < NR; i++) {
      const w = rr(0.45, 1.15) * (W / 6);
      const g = new THREE.PlaneGeometry(w, H * 1.05);
      g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(rnd()), 1));
      const mm = new THREE.Mesh(g, rayMat);
      mm.position.set(rr(-W / 2 + 0.3, W / 2 - 0.3), H * 0.5, rr(-D / 2 + 0.2, D / 2 - 0.2));
      mm.userData.tilt = rr(-0.16, 0.16);
      mm.renderOrder = 5;
      this.rays.add(mm);
    }

    /* ── glass, silicone and trim ───────────────────────────────────────── */
    const glassMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: TANK_U.uTime, uNight: TANK_U.uNight, uCaustic: TANK_U.uCaustic,
                  uCaus: { value: this.caus } },
      vertexShader: `varying vec3 vN, vV, vWP;
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWP = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `varying vec3 vN, vV, vWP; uniform sampler2D uCaus;
        uniform float uTime, uNight, uCaustic; ${CAUSTIC_SAMPLE}
        void main(){
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.2);
          float c = tkCaustic(vec2(vWP.x + vWP.z, vWP.y * 1.6)) * uCaustic * (1.0 - uNight*0.85);
          /* a dim room reflected in the front pane, brighter near the top */
          float room = smoothstep(0.0, ${(H).toFixed(2)}, vWP.y) * 0.5 + 0.25;
          float a = f * (0.26 + room * 0.16) + c * 0.05 * smoothstep(0.0, 1.2, vWP.y);
          gl_FragColor = vec4(vec3(0.62,0.82,0.95) * (0.7 + room * 0.5), a);
        }`,
    });
    const panes = add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, H + 0.07, D + 0.05), glassMat));
    panes.position.y = (H + 0.07) / 2 - 0.035;
    panes.renderOrder = 8;

    const sil = new THREE.MeshStandardMaterial({ color: 0x0a0f13, roughness: 0.45, metalness: 0.35 });
    const t = 0.05, W2 = W + 0.085, D2 = D + 0.085, H2 = H + 0.02;
    const edge = (w, h, d, x, y, z) => { const b = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), sil)); b.position.set(x, y, z); };
    for (const yy of [0, H2]) {
      edge(W2 + t, t, t, 0, yy, D2 / 2); edge(W2 + t, t, t, 0, yy, -D2 / 2);
      edge(t, t, D2, W2 / 2, yy, 0); edge(t, t, D2, -W2 / 2, yy, 0);
    }
    for (const sx of [1, -1]) for (const sz of [1, -1]) edge(t, H2, t, sx * W2 / 2, H2 / 2, sz * D2 / 2);

    return this;
  }

  /* ── drifting matter ──────────────────────────────────────────────────── */
  buildSnow() {
    const N = CFG.SNOW;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i*3] = rr(-1,1); pos[i*3+1] = rr(0,1); pos[i*3+2] = rr(-1,1); seed[i] = rnd(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.snow = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: TANK_U.uTime, uBox: { value: new THREE.Vector3(4,2.4,2.2) },
                  uNight: TANK_U.uNight, uMurk: TANK_U.uMurk, uPix: { value: 1 },
                  uMap: { value: this.dot } },
      vertexShader: `
        attribute float aSeed; uniform float uTime, uPix; uniform vec3 uBox; varying float vA;
        void main(){
          vec3 p = position * uBox * 0.5;
          float t = uTime * (0.02 + aSeed * 0.035);
          p.y = mod(p.y - t * 0.9 + uBox.y, uBox.y) - uBox.y * 0.5 + uBox.y * 0.5;
          p.x += sin(uTime * 0.25 + aSeed * 40.0) * 0.10;
          p.z += cos(uTime * 0.19 + aSeed * 27.0) * 0.10;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = (0.05 + aSeed * 0.13) * smoothstep(0.35, 1.5, d) * (1.0 - smoothstep(9.0, 24.0, d));
          gl_PointSize = (1.2 + aSeed * 2.2) * uPix * (7.0 / max(1.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; uniform float uNight, uMurk; uniform sampler2D uMap;
        void main(){
          float r = texture2D(uMap, gl_PointCoord).a;
          vec3 col = mix(vec3(0.84,0.94,1.0), vec3(0.58,0.86,0.72), uMurk);
          gl_FragColor = vec4(col, r * vA * (1.0 - uNight * 0.4));
          if (gl_FragColor.a < 0.004) discard;
        }`,
    }));
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 6;
    this.group.add(this.snow);
  }

  buildBubbles() {
    const N = CFG.BUBBLES;
    this.bubbleCap = N;
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xeafaff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.34,
      depthWrite: false, transmission: 0, ior: 1.1,
      emissive: 0x2a5f78, emissiveIntensity: 0.2,
    });
    m.onBeforeCompile = useWaterFog;
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 6), m, N);
    this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bubbles.frustumCulled = false; this.bubbles.count = 0;
    this.bubbles.renderOrder = 7;
    this.group.add(this.bubbles);
    this.bubbleList = [];
  }

  buildShadows() {
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uNight: TANK_U.uNight },
      vertexShader: `varying vec2 vU; void main(){ vU = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vU; uniform float uNight;
        void main(){ float d = length(vU - 0.5) * 2.0;
          gl_FragColor = vec4(0.0,0.02,0.035, (1.0 - smoothstep(0.1,1.0,d)) * 0.34 * (1.0 - uNight*0.5)); }`,
    }), 140);
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadows.frustumCulled = false; this.shadows.count = 0;
    this.shadows.rotation.x = -Math.PI / 2;
    this.shadows.renderOrder = 2;
    this.group.add(this.shadows);
  }

  buildFood() {
    const N = 460;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.foodPts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uPix: { value: 1 }, uMap: { value: this.dot } },
      vertexShader: `attribute float aSize; attribute vec3 aCol; varying vec3 vC; uniform float uPix;
        void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uPix * 46.0 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; uniform sampler2D uMap;
        void main(){ float r = texture2D(uMap, gl_PointCoord).a;
          if (r < 0.04) discard; gl_FragColor = vec4(vC, r); }`,
    }));
    this.foodPts.frustumCulled = false;
    this.foodPts.renderOrder = 6;
    this.group.add(this.foodPts);
    this.foodCap = N;
  }

  spawnBubble(x, y, z, r) {
    if (this.bubbleList.length >= this.bubbleCap) return;
    this.bubbleList.push({ x, y, z, r, vy: rr(0.55, 1.0), ph: rnd() * TAU, life: 0 });
  }
}

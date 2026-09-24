import * as THREE from 'three';
import { mat, glowTexture, damp, rimify } from './util.js';

const G = {
  sph: new THREE.SphereGeometry(1, 20, 14),
  sphLo: new THREE.SphereGeometry(1, 12, 8),
  cap: new THREE.CapsuleGeometry(1, 1, 4, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const glowTex = glowTexture('rgba(255,210,140,1)', 'rgba(255,140,40,0)');

function part(geo, material, sx, sy, sz, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy ?? sx, sz ?? sx); m.position.set(x, y, z);
  m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}
const pivot = (x, y, z, parent) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

const LOOKS = {
  ivy: { skin: 0xf4c9a8, hair: 0x9a3b1c, coat: 0xe8a23a, trim: 0xb86a18, legs: 0x3b3552, boots: 0x6a3a2a, scarf: 0xd8323c, style: 'girl', scale: 1 },
  rowan: { skin: 0xe8b894, hair: 0x3a2518, coat: 0x2f6f7e, trim: 0x1c4450, legs: 0x3b3a4a, boots: 0x4a2f22, scarf: 0xd8323c, style: 'boy', scale: 1.04 },
  pip: { skin: 0xf6cfae, hair: 0xe6c060, coat: 0x5aa44a, trim: 0x3c7a32, legs: 0x6a5a8a, boots: 0x333344, scarf: 0x3a78d0, style: 'pip', scale: 0.78 },
  bean: { skin: 0xf8d2b8, hair: 0x2a1a14, coat: 0xf2a0c0, trim: 0xd67aa0, legs: 0xf2a0c0, boots: 0xffd23a, scarf: null, style: 'bean', scale: 0.64 },
};

export function makeLantern(size = 1, bright = 1) {
  const g = new THREE.Group();
  const metal = mat(0x3a2a1c, { rough: 0.5, rim: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb04a, emissiveIntensity: 2.2 * bright, roughness: 0.3 });
  part(G.cyl, glass, 0.07, 0.13, 0.07, 0, -0.14, 0, g);
  part(G.cone, metal, 0.095, 0.07, 0.095, 0, -0.04, 0, g);
  part(G.cyl, metal, 0.085, 0.025, 0.085, 0, -0.215, 0, g);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 16, Math.PI), metal);
  handle.position.y = 0.0; g.add(handle);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.9); halo.position.y = -0.14; g.add(halo);
  g.scale.setScalar(size);
  g.userData = { glass, halo };
  return g;
}

function makeUmbrella() {
  const g = new THREE.Group();
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xf6e2c0, emissive: 0xff9a50, emissiveIntensity: 0.25, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.32, 8, 1, true), canopyMat);
  canopy.position.y = 0.95; g.add(canopy);
  const ribMat = mat(0xc04030, { rim: 0.3 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    part(G.sphLo, ribMat, 0.03, 0.03, 0.03, Math.cos(a) * 0.74, 0.79, Math.sin(a) * 0.74, g);
  }
  part(G.cyl, mat(0x4a3020), 0.012, 1.0, 0.012, 0, 0.45, 0, g);
  part(G.sphLo, ribMat, 0.035, 0.035, 0.035, 0, 1.12, 0, g);
  return g;
}

export function makeChar(kind) {
  const L = LOOKS[kind];
  const root = new THREE.Group();
  const body = pivot(0, 0, 0, root);
  body.scale.setScalar(L.scale);
  const m = {
    skin: mat(L.skin, { rim: 0.8 }), hair: mat(L.hair, { rim: 1.2, rough: 0.6 }), coat: mat(L.coat, { rim: 1 }),
    trim: mat(L.trim), legs: mat(L.legs), boots: mat(L.boots, { rough: 0.5 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.2 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    blush: new THREE.MeshBasicMaterial({ color: 0xff8a9a, transparent: true, opacity: 0.45, depthWrite: false }),
  };
  const kid = L.style === 'pip' || L.style === 'bean';
  const headR = kid ? 0.3 : 0.25;
  const hips = pivot(0, 0.6, 0, body);

  const legs = [-1, 1].map((sx) => {
    const p = pivot(sx * 0.085, 0, 0, hips);
    part(G.cap, m.legs, 0.062, 0.2, 0.062, 0, -0.24, 0, p);
    const knee = pivot(0, -0.36, 0, p);
    part(G.cap, m.legs, 0.056, 0.12, 0.056, 0, -0.09, 0, knee);
    part(G.sph, m.boots, 0.075, 0.07, 0.11, 0, -0.2, 0.03, knee);
    return { p, knee };
  });

  const torso = pivot(0, 0, 0, hips);
  if (L.style === 'girl') {
    part(G.cyl, m.coat, 1, 1, 1, 0, 0.14, 0, torso).scale.set(0.16, 0.3, 0.13);
    const hem = part(new THREE.CylinderGeometry(0.62, 1, 1, 14), m.coat, 0.26, 0.2, 0.22, 0, -0.05, 0, torso);
    hem.userData.hem = true;
  } else if (L.style === 'bean') {
    part(G.sph, m.coat, 0.2, 0.25, 0.17, 0, 0.12, 0, torso);
  } else {
    part(G.cap, m.coat, 0.17, 0.2, 0.13, 0, 0.14, 0, torso);
    part(G.cyl, m.trim, 0.175, 0.05, 0.135, 0, -0.03, 0, torso);
  }
  part(G.cyl, m.trim, 0.012, 0.25, 0.012, 0, 0.14, 0.13 * (L.style === 'bean' ? 1.3 : 1), torso);

  const chest = pivot(0, 0.3, 0, torso);
  const head = pivot(0, 0.06 + headR, 0, chest);
  part(G.sph, m.skin, headR, headR * 0.96, headR * 0.94, 0, 0, 0, head);
  const eyes = [-1, 1].map((sx) => {
    const e = part(G.sphLo, m.eye, 0.034, 0.046, 0.02, sx * headR * 0.36, -headR * 0.02, headR * 0.9, head);
    part(G.sphLo, m.white, 0.3, 0.3, 0.3, 0.25, 0.3, 0.6, e);
    part(G.sphLo, m.blush, 0.05, 0.03, 0.01, sx * headR * 0.58, -headR * 0.28, headR * 0.8, head);
    return e;
  });
  part(G.sphLo, m.eye, 0.022, 0.009, 0.01, 0, -headR * 0.36, headR * 0.93, head);

  const hairCap = part(G.sph, m.hair, headR * 1.06, headR * 1.04, headR * 1.05, 0, headR * 0.1, -headR * 0.08, head);
  hairCap.scale.y *= 0.95;
  for (let i = -2; i <= 2; i++) part(G.sphLo, m.hair, headR * 0.3, headR * 0.2, headR * 0.16, i * headR * 0.24, headR * 0.62 - Math.abs(i) * 0.02, headR * 0.72, head);
  const tail = [];
  if (L.style === 'girl') {
    let anchor = pivot(0, headR * 0.35, -headR * 0.95, head);
    part(G.sph, mat(L.scarf), 0.05, 0.05, 0.05, 0, 0, 0, anchor);
    [0.1, 0.085, 0.065, 0.045].forEach((r, i) => {
      const seg = pivot(0, -r * 0.4, -r * 1.1, anchor);
      part(G.sph, m.hair, r, r * 1.2, r, 0, -r * 0.6, 0, seg);
      tail.push(seg); anchor = seg;
    });
    [-1, 1].forEach((sx) => part(G.sph, m.hair, headR * 0.3, headR * 0.62, headR * 0.34, sx * headR * 0.78, -headR * 0.28, -headR * 0.3, head));
  } else if (L.style === 'boy' || L.style === 'pip') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const tuft = part(G.cone, m.hair, headR * 0.28, headR * 0.5, headR * 0.28, Math.cos(a) * headR * 0.5, headR * 0.95, Math.sin(a) * headR * 0.5 - headR * 0.2, head);
      tuft.rotation.set(Math.sin(a) * -0.7, 0, Math.cos(a) * 0.7);
    }
    if (L.style === 'pip') {
      [-1, 1].forEach((sx) => part(G.sph, m.coat, headR * 0.28, headR * 0.28, headR * 0.12, sx * headR * 0.72, headR * 0.82, -headR * 0.2, head));
      part(G.sph, m.coat, headR * 1.05, headR * 0.6, headR * 0.5, 0, -headR * 0.55, -headR * 0.7, head);
    }
  } else {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      part(G.sphLo, m.hair, headR * 0.3, headR * 0.3, headR * 0.3, Math.cos(a) * headR * 0.85, headR * 0.35 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * headR * 0.85 - headR * 0.15, head);
    }
  }

  const scarfSegs = [];
  if (L.scarf) {
    const scarfMat = mat(L.scarf, { rim: 1.2 });
    part(new THREE.TorusGeometry(1, 0.38, 8, 18), scarfMat, 0.12, 0.12, 0.12, 0, 0.05, 0, chest).rotation.x = Math.PI / 2;
    let anchor = pivot(0.05, 0.03, -0.12, chest);
    for (let i = 0; i < 5; i++) {
      const seg = pivot(0, 0, -0.02, anchor);
      part(G.box, scarfMat, 0.075, 0.02, 0.11, 0, 0, -0.055, seg);
      seg.position.z = i === 0 ? 0 : -0.11;
      scarfSegs.push(seg); anchor = seg;
    }
  }

  const arms = [-1, 1].map((sx) => {
    const p = pivot(sx * 0.17, 0.2, 0, chest);
    part(G.cap, m.coat, 0.05, 0.16, 0.05, 0, -0.12, 0, p);
    const hand = pivot(0, -0.27, 0, p);
    part(G.sphLo, m.skin, 0.05, 0.05, 0.05, 0, 0, 0, hand);
    return { p, hand };
  });

  let lantern = null, umbrella = null, plush = null;
  if (!kid || kind === 'pip') {
    lantern = makeLantern(kid ? 0.8 : 1, kid ? 0.7 : 1);
    lantern.position.set(0, -0.02, 0.02);
    arms[0].hand.add(lantern);
    if (kid) lantern.visible = false;
  }
  if (!kid) { umbrella = makeUmbrella(); umbrella.visible = false; umbrella.rotation.x = Math.PI; umbrella.position.y = 0.05; arms[1].hand.add(umbrella); }
  if (kind === 'bean') {
    plush = new THREE.Group();
    const w = mat(0xf4efe8, { rim: 1 });
    part(G.sphLo, w, 0.07, 0.08, 0.06, 0, 0, 0, plush);
    part(G.sphLo, w, 0.055, 0.05, 0.05, 0, 0.1, 0, plush);
    [-1, 1].forEach((sx) => part(G.sphLo, w, 0.018, 0.07, 0.018, sx * 0.025, 0.18, 0, plush));
    plush.position.set(0, -0.04, 0.06); arms[1].hand.add(plush);
  }

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const st = { phase: 0, blink: 2, mode: 'idle', speed: 0, air: 0, lean: 0, look: 0, t: 0, wave: 0 };
  const api = {
    kind, root, head, lantern, umbrella, arms, legs, st,
    setMode(mo) { st.mode = mo; if (umbrella) umbrella.visible = mo === 'glide'; },
    update(dt) {
      st.t += dt;
      const mo = st.mode;
      const run = mo === 'run' || mo === 'walk';
      const rate = mo === 'walk' ? 7 : 11 * Math.min(1.25, 0.55 + st.speed / 14);
      st.phase += dt * (run ? rate : 2);
      const ph = st.phase, s = Math.sin(ph), c = Math.cos(ph);
      const k = 12;
      const setR = (o, x, y = 0, z = 0) => { o.rotation.x = damp(o.rotation.x, x, k, dt); o.rotation.y = damp(o.rotation.y, y, k, dt); o.rotation.z = damp(o.rotation.z, z, k, dt); };
      let hipY = 0.6, lean = 0;
      if (run) {
        const amp = mo === 'walk' ? 0.55 : 0.95;
        setR(legs[0].p, s * amp); setR(legs[1].p, -s * amp);
        setR(legs[0].knee, Math.max(0, -c) * 1.2); setR(legs[1].knee, Math.max(0, c) * 1.2);
        setR(arms[0].p, -0.9 - s * 0.15, 0, -0.15); setR(arms[1].p, s * 0.9, 0, 0.1);
        hipY = 0.6 + Math.abs(c) * 0.05; lean = mo === 'walk' ? 0.05 : 0.2;
        setR(head, -0.12, st.look, 0);
      } else if (mo === 'jump') {
        setR(legs[0].p, -0.9); setR(legs[1].p, 0.3); setR(legs[0].knee, 1.4); setR(legs[1].knee, 0.6);
        setR(arms[0].p, -1.3, 0, -0.3); setR(arms[1].p, -2.4, 0, 0.4); lean = 0.1;
        setR(head, 0.1, 0, 0);
      } else if (mo === 'sit') {
        hipY = 0.2;
        setR(legs[0].p, -1.5); setR(legs[1].p, -1.4); setR(legs[0].knee, 0.4); setR(legs[1].knee, 0.5);
        setR(arms[0].p, -1.1 + Math.sin(st.t * 1.5) * 0.05, 0, -0.1); setR(arms[1].p, -0.5, 0, 0.3);
        setR(head, 0, st.look, 0);
      } else if (mo === 'glide') {
        const sw = Math.sin(st.t * 2.2);
        setR(legs[0].p, 0.3 + sw * 0.25); setR(legs[1].p, 0.1 - sw * 0.25); setR(legs[0].knee, 0.5); setR(legs[1].knee, 0.7);
        setR(arms[0].p, -0.7, 0, -0.35); setR(arms[1].p, -3.0, 0, -0.15);
        setR(head, -0.25, st.look, 0); lean = 0.05;
      } else if (mo === 'ride') {
        hipY = 0.25;
        setR(legs[0].p, -1.3, 0, -0.5); setR(legs[1].p, -1.3, 0, 0.5); setR(legs[0].knee, 1.1); setR(legs[1].knee, 1.1);
        setR(arms[0].p, -1.5 - Math.sin(st.t) * 0.3, 0, -0.4); setR(arms[1].p, -2.6 + Math.sin(st.t * 1.3) * 0.2, 0, 0.5);
        setR(head, -0.2, st.look, 0);
      } else if (mo === 'hug') {
        setR(legs[0].p, 0.1); setR(legs[1].p, -0.1); setR(legs[0].knee, 0.2); setR(legs[1].knee, 0.2);
        setR(arms[0].p, -1.3, -0.6, 0.5); setR(arms[1].p, -1.3, 0.6, -0.5);
        hipY = 0.58; setR(head, 0.25, 0, 0.15);
      } else if (mo === 'raise') {
        setR(legs[0].p, 0.05); setR(legs[1].p, -0.05); setR(legs[0].knee, 0); setR(legs[1].knee, 0);
        setR(arms[0].p, -3.0, 0, -0.1); setR(arms[1].p, -2.7, 0, 0.3); setR(head, -0.5, 0, 0);
      } else {
        const b = Math.sin(st.t * 2);
        setR(legs[0].p, 0); setR(legs[1].p, 0); setR(legs[0].knee, 0); setR(legs[1].knee, 0);
        setR(arms[0].p, -0.7 + b * 0.03, 0, -0.12);
        st.wave = Math.max(0, st.wave - dt);
        if (st.wave > 0) setR(arms[1].p, -2.8, 0, 0.3 + Math.sin(st.t * 12) * 0.35);
        else setR(arms[1].p, 0.05, 0, 0.12 + b * 0.02);
        hipY = 0.6 + b * 0.006; setR(head, 0.02, st.look, Math.sin(st.t * 0.7) * 0.05);
      }
      hips.position.y = damp(hips.position.y, hipY, 10, dt);
      torso.rotation.x = damp(torso.rotation.x, lean, 6, dt);
      torso.rotation.z = damp(torso.rotation.z, st.lean, 6, dt);
      st.blink -= dt;
      const bl = st.blink < 0.12 ? 0.1 : 1;
      if (st.blink < 0) st.blink = 2 + Math.random() * 3;
      eyes.forEach((e) => (e.scale.y = 0.046 * bl));
      const wind = mo === 'idle' || mo === 'hug' || mo === 'raise' ? 0.2 : 1;
      scarfSegs.forEach((sg, i) => {
        sg.rotation.x = (i === 0 ? 0.9 - wind * 0.7 : 0.12 - wind * 0.08) + Math.sin(st.t * 9 - i * 0.9) * 0.18 * wind;
        sg.rotation.y = Math.sin(st.t * 5 - i) * 0.12 * wind;
      });
      tail.forEach((sg, i) => {
        sg.rotation.x = 0.35 + (run ? Math.sin(ph * 2 - i * 0.7) * 0.25 : Math.sin(st.t * 2 - i) * 0.05) - (mo === 'glide' ? 0.6 : 0);
        sg.rotation.z = run ? Math.sin(ph - i * 0.5) * 0.2 : 0;
      });
      if (lantern) {
        const lp = lantern.parent.getWorldQuaternion(_q);
        lantern.quaternion.copy(lp.invert());
        lantern.rotateZ(Math.sin(st.t * 3) * 0.06);
      }
    },
  };
  api.setMode('idle');
  return api;
}
const _q = new THREE.Quaternion();

const wingVert = `varying vec2 vUv; void main(){ vUv = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const wingFrag = `uniform float gold, time, span; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec2 p = vUv / span;
    float r = length(p);
    vec3 night = mix(vec3(0.02, 0.01, 0.05), vec3(0.12, 0.06, 0.25), smoothstep(0.1, 1.0, r));
    vec3 day = mix(vec3(1.0, 0.75, 0.35), vec3(1.0, 0.95, 0.8), smoothstep(0.2, 1.0, r));
    vec3 c = mix(night, day * 0.55, gold);
    vec2 g = p * 7.0; vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
    float rnd = h(cell);
    float spot = smoothstep(0.22, 0.05, length(f + (vec2(h(cell + 3.1), h(cell + 7.7)) - 0.5) * 0.4)) * step(0.55, rnd);
    float tw = 0.6 + 0.4 * sin(time * 2.0 + rnd * 40.0);
    c += vec3(1.0, 0.6, 0.25) * spot * tw * (1.6 - gold * 1.1);
    float eye = smoothstep(0.16, 0.12, length(p - vec2(0.55, 0.15))) - smoothstep(0.1, 0.06, length(p - vec2(0.55, 0.15)));
    c += mix(vec3(0.6, 0.4, 1.0), vec3(1.0, 1.0, 0.9), gold) * eye * 1.5;
    float vein = smoothstep(0.02, 0.0, abs(sin(atan(p.y, p.x) * 9.0)) * r * 0.2);
    c += mix(vec3(0.3, 0.2, 0.6), vec3(1.0, 0.8, 0.5), gold) * vein * 0.4;
    gl_FragColor = vec4(c, 1.0);
  }`;

function wingShape(span, lower) {
  const s = new THREE.Shape();
  if (!lower) {
    s.moveTo(0, 0);
    s.bezierCurveTo(span * 0.3, span * 0.55, span * 0.85, span * 0.75, span, span * 0.35);
    s.bezierCurveTo(span * 1.05, span * 0.05, span * 0.7, -span * 0.12, 0, -span * 0.08);
  } else {
    s.moveTo(0, -span * 0.05);
    s.bezierCurveTo(span * 0.5, -span * 0.1, span * 0.75, -span * 0.35, span * 0.55, -span * 0.7);
    s.bezierCurveTo(span * 0.35, -span * 0.85, span * 0.1, -span * 0.5, 0, -span * 0.2);
  }
  return new THREE.ShapeGeometry(s, 24);
}

export function makeMoth() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const u = { gold: { value: 0 }, time: { value: 0 }, span: { value: 7 } };
  const wingMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: wingVert, fragmentShader: wingFrag, side: THREE.DoubleSide });
  const wings = [];
  [[7, false], [4.6, true]].forEach(([span, lower]) => {
    const geo = wingShape(span, lower);
    [-1, 1].forEach((sx) => {
      const pv = new THREE.Group(); pv.position.set(sx * 0.35, 0.3, lower ? -0.6 : 0.4);
      const m = new THREE.Mesh(geo, wingMat); m.rotation.x = Math.PI / 2; m.scale.x = sx;
      pv.add(m); body.add(pv); wings.push({ pv, sx, lower });
    });
  });
  const fur = new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.9, emissive: 0x000000 });
  rimify(fur, 2);
  [[0, 0.3, 0.6, 0.55, 0.5, 0.7], [0, 0.25, -0.5, 0.5, 0.45, 0.9], [0, 0.2, -1.6, 0.38, 0.35, 0.8], [0, 0.18, -2.4, 0.26, 0.26, 0.5]].forEach(([x, y, z, sx, sy, sz]) => {
    part(G.sph, fur, sx, sy, sz, x, y, z, body);
  });
  const head = part(G.sph, fur, 0.45, 0.42, 0.4, 0, 0.35, 1.35, body);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb890ff });
  [-1, 1].forEach((sx) => part(G.sph, eyeMat, 0.2, 0.22, 0.18, sx * 0.3, 0.42, 1.55, body));
  const antMat = mat(0x2a1a40, { rim: 2 });
  [-1, 1].forEach((sx) => {
    const a = pivot(sx * 0.2, 0.7, 1.5, body); a.rotation.set(-0.6, 0, sx * -0.5);
    part(G.cap, antMat, 0.035, 1.1, 0.035, 0, 0.6, 0, a);
    for (let i = 0; i < 6; i++) part(G.box, antMat, 0.45 - i * 0.05, 0.02, 0.05, 0, 0.3 + i * 0.16, 0, a);
  });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7040ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(14); halo.position.y = 0.3; body.add(halo);
  let t = 0, flapRate = 2.2, flapAmp = 0.55;
  return {
    root, body, u, eyeMat, fur, halo, head,
    setGold(g) {
      u.gold.value = g;
      eyeMat.color.setRGB(0.72 + g * 0.28, 0.56 + g * 0.4, 1 - g * 0.2);
      fur.color.setRGB(0.1 + g * 0.8, 0.06 + g * 0.55, 0.19 + g * 0.1);
      fur.emissive.setRGB(g * 0.35, g * 0.2, g * 0.05);
      halo.material.color.setRGB(0.45 - g * 0.1, 0.25 + g * 0.1, 1 - g * 0.8);
    },
    flap(rate, amp) { flapRate = rate; flapAmp = amp; },
    update(dt) {
      t += dt; u.time.value = t;
      const f = Math.sin(t * flapRate * Math.PI);
      wings.forEach((w) => { w.pv.rotation.z = w.sx * (0.15 + f * flapAmp * (w.lower ? 0.8 : 1)); w.pv.rotation.y = w.sx * (w.lower ? 0.2 : -0.1); });
      body.position.y = -f * 0.25;
    },
  };
}

// Jon's face rig: brows, lids, eyes, mouth morphs, jaw, talk flap, dizzy stars.
import * as THREE from '../../vendor/three/three.module.js';
import { MOUTH_TARGETS } from './jon_body.js';

const D2R = Math.PI / 180;
const BASE = { browY: 0, tilt: 0, lidU: -0.04, lidL: 0.05, open: 0.12, smile: 0.7, frown: 0, wide: 0, o: 0, grit: 0, dizzy: 0, squint: 0 };
export const EXPRESSIONS = {
  neutral: {},
  happy: { browY: 0.007, tilt: 0.15, lidU: 0.05, lidL: 0.45, smile: 1, open: 0.35 },
  angry: { browY: -0.007, tilt: -1, lidU: 0.38, lidL: 0.25, smile: 0, frown: 0.9, grit: 0.7, open: 0.12 },
  pain: { browY: -0.002, tilt: 1.1, lidU: 1, lidL: 0.7, smile: 0, frown: 0.4, grit: 1, wide: 1, open: 0.3, squint: 1 },
  shock: { browY: 0.02, tilt: 0.35, lidU: -0.3, lidL: -0.3, smile: 0, o: 1, open: 0.55 },
  dizzy: { browY: 0.005, tilt: 0.7, lidU: 0.45, lidL: 0.1, smile: 0.25, open: 0.35, wide: 0.3, dizzy: 1 },
  sad: { browY: 0.006, tilt: 1.1, lidU: 0.42, lidL: 0.1, smile: 0, frown: 1, open: 0.04 },
  talk: { smile: 0.5 },
  closed: { lidU: 1, lidL: 0.3, smile: 0.1 },
};

function starGeo() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.011 : 0.026;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 });
}

export function createFace(bones, mouthMesh) {
  const cur = { ...BASE }, tgt = { ...BASE };
  const mi = MOUTH_TARGETS.reduce((o, n, i) => (o[n] = i, o), {});
  const browBind = { L: bones.browL.position.clone(), R: bones.browR.position.clone() };
  let name = 'neutral', talking = false, talkT = 0, t = 0;
  let blinkT = 2 + Math.random() * 2, blink = 0;
  const look = new THREE.Vector2(), lookTgt = new THREE.Vector2();
  let sacc = 1;

  const stars = new THREE.Group();
  const sg = starGeo(), sm = new THREE.MeshBasicMaterial({ color: 0xffd84a });
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(sg, sm); stars.add(m); }
  stars.position.set(0, 0.32, 0.0);
  stars.visible = false;
  bones.head.add(stars);

  function set(n) {
    if (n === 'talk') { talking = true; if (name === 'talk') return; n = 'talk'; }
    name = n;
    Object.assign(tgt, BASE, EXPRESSIONS[n] || {});
  }
  set('neutral');

  function update(dt, opts = {}) {
    t += dt;
    const k = 1 - Math.exp(-dt * 14);
    for (const key in cur) cur[key] += (tgt[key] - cur[key]) * k;

    // blink
    blinkT -= dt;
    if (blinkT <= 0) { blink = 1; blinkT = 2.2 + Math.random() * 3.5; if (Math.random() < 0.2) blinkT = 0.25; }
    blink = Math.max(0, blink - dt * 7);
    const bl = Math.sin(blink * Math.PI);

    // talk flap
    let flap = 0, ovar = 0;
    if (talking || opts.talk) {
      talkT += dt;
      const syl = Math.sin(talkT * 15.5) * 0.5 + 0.5, env = 0.55 + 0.45 * Math.sin(talkT * 3.1 + Math.sin(talkT * 7.3));
      flap = Math.pow(syl, 1.4) * env;
      ovar = Math.max(0, Math.sin(talkT * 5.7)) * 0.5;
    }

    const lidU = Math.min(1, cur.lidU + (1 - Math.max(cur.lidU, 0)) * bl);
    const upA = -46 + (lidU + 0.0) * 82;
    bones.lidUL.rotation.set(upA * D2R, 0, 0.06 * cur.tilt);
    bones.lidUR.rotation.set(upA * D2R, 0, -0.06 * cur.tilt);
    const loA = 36 - Math.min(1, cur.lidL + bl * 0.3) * 30;
    bones.lidLL.rotation.x = loA * D2R; bones.lidLR.rotation.x = loA * D2R;

    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      const b = bones['brow' + s];
      b.position.copy(browBind[s]); b.position.y += cur.browY - 0.004 * cur.squint;
      b.position.x -= sg * 0.004 * Math.max(0, -cur.tilt);
      b.rotation.z = -sg * cur.tilt * 26 * D2R;
    }

    // eyes: look target + saccades + dizzy roll
    sacc -= dt;
    if (sacc <= 0) { sacc = 0.6 + Math.random() * 2.2; lookTgt.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.12); }
    const lt = opts.look || lookTgt;
    look.lerp(lt, 1 - Math.exp(-dt * 18));
    let ex = look.x, ey = look.y;
    if (cur.dizzy > 0.05) {
      const a = t * 7;
      ex = ex * (1 - cur.dizzy) + Math.cos(a) * 0.35 * cur.dizzy;
      ey = ey * (1 - cur.dizzy) + Math.sin(a) * 0.3 * cur.dizzy;
    }
    bones.eyeL.rotation.set(-ey, ex, 0);
    bones.eyeR.rotation.set(-ey, ex + (cur.dizzy > 0.05 ? -0.5 * cur.dizzy * Math.cos(t * 7) : 0), 0);

    const mt = mouthMesh.morphTargetInfluences;
    const open = Math.min(1.2, cur.open + flap * 0.75);
    mt[mi.open] = open; mt[mi.smile] = cur.smile; mt[mi.frown] = cur.frown;
    mt[mi.wide] = cur.wide; mt[mi.o] = Math.min(1, cur.o + ovar * flap); mt[mi.grit] = cur.grit;
    bones.jaw.rotation.x = open * 9 * D2R;

    stars.visible = cur.dizzy > 0.3;
    if (stars.visible) {
      stars.children.forEach((m, i) => {
        const a = t * 3.2 + i * Math.PI / 2;
        m.position.set(Math.cos(a) * 0.16, 0.02 * Math.sin(a * 2), Math.sin(a) * 0.14);
        m.rotation.set(0, -a, t * 4);
      });
    }
  }

  return {
    set, update,
    stopTalk() { talking = false; if (name === 'talk') set('neutral'); },
    stars, get name() { return name; }, get talking() { return talking; },
    setTalking(v) { talking = !!v; },
    dispose() { sg.dispose(); sm.dispose(); },
  };
}

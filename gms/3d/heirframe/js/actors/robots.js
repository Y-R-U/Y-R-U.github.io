import * as THREE from '../../../../lib/three/0.180.0/three.module.js';
import { makeRig, makeBones, BONES, BI, NB } from './rig.js';
import { PartBuilder } from './parts.js';
import { KINDS, kindOf } from './kinds.js';
import { NCH, PX, evalBase, evalAction, ACTIONS, LOWER, eyeCurve, smooth } from './anims.js';
import { setMaterialQuality, flashMat, applyPaint, PAINTS, HORIZON_BAND } from './materials.js';

export const ROBOT_KINDS = Object.keys(KINDS);
export { PAINTS };
export const ANIMS = ['idle', 'walk', 'run', 'attack_melee', 'attack_heavy', 'shoot', 'cast', 'dodge', 'hit', 'die', 'talk', 'sit'];

const templates = new Map();
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; }
function rng(seed) { let s = hash(seed) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function getTemplate(kind, tier, variant, quality, lod) {
  const key = [kind, tier, variant, quality, lod].join('|');
  let t = templates.get(key);
  if (t) return t;
  const K = KINDS[kind];
  const rig = makeRig(K.dims(variant, tier));
  const b = new PartBuilder(rig, quality, lod);
  K.build(b, { tier, variant, far: lod === 'far' || lod === 'tiny' });
  const { geometry, slots, tris } = b.build(K.slots);
  const h = K.height;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), h * 0.95);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-h * 0.6, -h * 0.2, -h * 0.6), new THREE.Vector3(h * 0.6, h * 1.2, h * 0.6));
  const inverses = BONES.map((n) => { const w = rig.world[n]; return new THREE.Matrix4().makeTranslation(-w[0], -w[1], -w[2]); });
  t = { rig, geometry, slots, tris, inverses };
  templates.set(key, t);
  return t;
}

// Crowd path: every material slot baked into vertex attributes so the whole robot is ONE draw call per pass.
const mergedGeo = new Map();
function mergedGeometry(T, key, mats) {
  let g = mergedGeo.get(key);
  if (g) return g;
  g = T.geometry.clone();
  const n = g.attributes.position.count, col = new Float32Array(n * 3), pbr = new Float32Array(n * 4), idx = g.index.array;
  for (const gr of g.groups) {
    const m = mats[gr.materialIndex];
    const glowing = m.emissive && m.emissiveIntensity > 0 && m.color.r + m.color.g + m.color.b < 0.01;
    const c = glowing ? m.emissive.clone().multiplyScalar(m.emissiveIntensity) : m.color;
    const coat = m.clearcoat || 0;
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      const v = idx[i];
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      pbr[v * 4] = m.metalness; pbr[v * 4 + 1] = m.roughness; pbr[v * 4 + 2] = glowing ? 1 : 0; pbr[v * 4 + 3] = coat;
    }
  }
  g.clearGroups();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 4));
  mergedGeo.set(key, g);
  return g;
}
const mergedMats = {};
function mergedMaterial(low) {
  const k = low ? 'lo' : 'hi';
  if (mergedMats[k]) return mergedMats[k];
  const m = low ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, envMapIntensity: 1.25 })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 1, roughness: 1, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.25 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 pbr;\nvarying vec4 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vPbr;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 glowC = diffuseColor.rgb * vPbr.z; diffuseColor.rgb *= 1.0 - vPbr.z;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPbr.x;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPbr.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowC;\n{ float rimF = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 3.0 ); totalEmissiveRadiance += ( diffuseColor.rgb * 0.35 + vec3( 0.05, 0.055, 0.06 ) ) * rimF; }')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>' + HORIZON_BAND)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= vPbr.w;\n#endif');
  };
  m.customProgramCacheKey = () => 'robotMerged' + k;
  m.name = 'robot:merged';
  return (mergedMats[k] = m);
}

export function robotStats(kind, opts = {}) {
  const r = createRobot({ kind, ...opts });
  const s = { drawCalls: r.drawCalls, tris: r.tris, height: r.height };
  r.dispose();
  return s;
}

// every live robot, for world effects (ground contact shadows)
export const LIVE_ROBOTS = new Set();

export function createRobot({ kind = 'civ_chrome', tier = 0, seed = 1, quality = 'high', lod = 'near', paint = null, merged = false } = {}) {
  kind = kindOf(kind);
  const K = KINDS[kind];
  tier = Math.max(0, Math.min(4, tier | 0));
  setMaterialQuality(quality);
  const r01 = rng(seed * 7919 + 13);
  const variant = K.variants ? (seed >>> 0) % K.variants : 0;
  const tone = (hash(seed) >>> 3) % 3;
  const T = getTemplate(kind, tier, variant, quality, lod);
  const D = T.rig.D;

  // Materials: shared, except eye/glow which fade/flash per instance.
  const M = applyPaint(K.mats({ tier, variant, tone, kind }), paint);
  const own = [];
  const mats = T.slots.map((s) => {
    let m = M[s];
    if (s === 'eye' || s === 'glow') {
      m = m.clone();
      m.userData.baseEI = m.emissiveIntensity; m.userData.baseC = m.emissive.clone(); m.userData.slot = s;
      own.push(m);
    }
    return m;
  });
  const flash = merged ? flashMat() : T.slots.map(() => flashMat());
  let geometry = T.geometry, meshMats = mats, lodGeo = null;
  if (merged) {
    const key = [kind, tier, variant, quality, lod, tone, JSON.stringify(paint)].join('|');
    geometry = mergedGeometry(T, key, T.slots.map((s) => M[s]));
    if (lod === 'far') {
      // distant crowd members swap to a coarser mesh on the same skeleton (see api.setLod)
      const Tt = getTemplate(kind, tier, variant, quality, 'tiny');
      lodGeo = [geometry, mergedGeometry(Tt, key + '|tiny', Tt.slots.map((s) => M[s]))];
    }
    meshMats = mergedMaterial(quality === 'low');
    own.length = 0;
  }

  const bones = makeBones(T.rig);
  const mesh = new THREE.SkinnedMesh(geometry, meshMats);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones, T.inverses), new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = quality === 'high' && lod !== 'far';
  mesh.name = 'robot:' + kind;
  const sc = K.scaleVar ? 1 + (r01() - 0.5) * 2 * K.scaleVar : 1;
  const sw = K.scaleVar ? sc * (1 + (r01() - 0.5) * K.scaleVar) : 1;
  mesh.scale.set(sw, sc, sw);

  const root = new THREE.Group();
  root.name = 'robot';
  root.add(mesh);

  const sockets = {};
  const sock = (name, bone, p) => { const o = new THREE.Object3D(); o.name = 'socket:' + name; o.position.fromArray(p); bones[BI[bone]].add(o); sockets[name] = o; };
  const S = K.sockets || {};
  sock('head', 'head', S.head || [0, 0.13, 0.02]);
  sock('handL', 'handL', S.handL || [0, -0.09, 0]);
  sock('handR', 'handR', S.handR || [0, -0.09, 0]);
  const mz = S.muzzle || ['handR', [0, -0.16, 0.02]];
  sock('muzzle', mz[0], mz[1]);
  sock('back', 'chest', S.back || [0, 0.14, -0.14]);

  // ---- animation state ----
  const style = K.style || {};
  const ctx = {
    D, style, hover: K.rig === 'hover', quad: K.rig === 'quad', t: 0, tmp: new Float32Array(NCH),
    move: { v: 0, target: 0, g: 0, phase: 0, stride: 0, v01: 0 },
    st: { gy: 0, gp: 0, ty: 0, tp: 0, gt: 1 + r01() * 2, tilt: style.tilt || 0, twitch: 0, hitDir: 1, r: r01 },
  };
  const runSpeed = K.runSpeed || 4.5;
  let mps = null;
  const Bp = new Float32Array(NCH), Ap = new Float32Array(NCH), Out = new Float32Array(NCH), From = new Float32Array(NCH);
  let base = 'idle', baseT = 0, act = null, fade = 1, fadeDur = 0.15, lowerKeep = 0;
  let aimYaw = null, aimW = 0, aimRel = 0, eye = 1, eyeTarget = 1, flashT = 0, rotor = 0, rotorSpeed = 1;
  let explicitMove = false;
  let alert = 0, alertW = 0, lastAlert = 0;
  const ALERT_C = [null, new THREE.Color(0xffa21a), new THREE.Color(0xff2418)];

  function freeze(f) { From.set(Out); fade = 0; fadeDur = Math.max(0.001, f); }

  const api = {
    root, mesh, sockets, kind, tier, seed,
    height: K.height * sc, radius: K.radius * sw, seatHeight: ctx.hover || ctx.quad ? 0 : (D.shin + D.ankle) * sc,
    runSpeed, drawCalls: merged ? 1 : T.slots.length, tris: T.tris,
    onEvent: null,
    lod: 0,
    // far LOD also drops the clearcoat lobe (the physical material is the costliest crowd shader)
    setLod(i) {
      if (!lodGeo || i === api.lod) return;
      api.lod = i; mesh.geometry = lodGeo[i];
      meshMats = mergedMaterial(i === 1 || quality === 'low');
      if (flashT <= 0) mesh.material = meshMats;
    },
    get state() { return { base, action: act && act.name, dead: !!(act && act.name === 'die'), speed: ctx.move.v }; },

    play(name, { loop, speed = 1, fade: f = 0.15 } = {}) {
      if (name === 'idle' || name === 'walk' || name === 'run') {
        if (!explicitMove) ctx.move.target = name === 'idle' ? 0 : name === 'walk' ? Math.min(1.6, runSpeed * 0.35) : runSpeed;
        if (base !== 'loco' && base !== 'idle' || act) freeze(f);
        base = 'idle'; act = null; eyeTarget = 1;
        return 0;
      }
      if (name === 'talk' || name === 'sit') {
        freeze(f); base = name; baseT = 0; act = null; eyeTarget = 1;
        return 0;
      }
      const def = ACTIONS[name];
      if (!def) return 0;
      freeze(f);
      if (name === 'hit') ctx.st.hitDir = r01() < 0.5 ? -1 : 1;
      act = { name, t: 0, dur: def.dur, speed, loop: !!loop && !def.hold, def, fired: {} };
      eyeTarget = 1;
      return def.dur / speed;
    },
    setMove(speed01, metersPerSec) {
      explicitMove = true;
      mps = metersPerSec ?? null;
      ctx.move.target = mps ?? Math.max(0, Math.min(1, speed01)) * runSpeed;
    },
    // 0 unaware, 1 suspicious (amber), 2 hostile (red)
    setAlert(level) { alert = Math.max(0, Math.min(2, level | 0)); },
    get alert() { return alert; },
    setAim(yaw) { aimYaw = yaw === null || yaw === undefined ? null : yaw; },
    hitFlash(dur = 0.09) { flashT = dur; mesh.material = flash; },
    update(dt) {
      dt = Math.min(dt, 0.1);
      ctx.t += dt; baseT += dt;
      const m = ctx.move;
      m.v += (m.target - m.v) * (1 - Math.exp(-dt * 10));
      if (m.v < 1e-3) m.v = 0;
      const vn = m.v * 0.86 / D.leg;
      m.g = smooth((vn - 1.9) / 1.1);
      const f = lerp(0.74 + 0.17 * vn, 1.25 + 0.075 * vn, m.g) * (style.cadence || 1);
      const duty = style.duty ?? lerp(0.6, 0.34, m.g);
      m.stride = m.v * duty / f;
      m.phase = (m.phase + f * dt) % 1;
      m.v01 = Math.min(1, m.v / runSpeed);

      // glances / servo twitches
      const st = ctx.st;
      st.gt -= dt;
      if (st.gt <= 0) {
        st.gt = 1.5 + r01() * 3.5;
        st.ty = (r01() - 0.5) * (m.v > 0.5 ? 0.4 : 1.1);
        st.tp = (r01() - 0.5) * 0.3;
        if (style.jank && r01() < 0.5) st.twitch = (r01() - 0.5) * 0.8;
      }
      const k = 1 - Math.exp(-dt * (style.jank ? 22 : 9));
      st.gy += (st.ty - st.gy) * k; st.gp += (st.tp - st.gp) * k;
      st.twitch *= Math.exp(-dt * 3);

      // action progress + events
      if (act) {
        act.t += dt * act.speed;
        const u = act.t / act.dur;
        for (const [ev, at] of Object.entries(act.def.events)) {
          if (!act.fired[ev] && u >= at) { act.fired[ev] = true; api.onEvent && api.onEvent(ev, act.name); }
        }
        if (act.t >= act.dur) {
          if (act.loop) { act.t %= act.dur; act.fired = {}; }
          else if (act.def.hold) act.t = act.dur;
          else { const n = act.name; freeze(0.2); act = null; api.onEvent && api.onEvent('end', n); }
        }
      }

      const bname = base === 'idle' ? 'loco' : base;
      evalBase(ctx.hover && bname === 'loco' ? 'idle' : bname, Bp, ctx, baseT);
      if (act) {
        evalAction(act.name, Ap, Math.min(1, act.t / act.dur), ctx);
        const keep = act.def.upper && m.v > 0.3 ? 1 : 0;
        lowerKeep += (keep - lowerKeep) * (1 - Math.exp(-dt * 12));
        for (let i = 0; i < NCH; i++) Bp[i] = LOWER[i] ? lerp(Ap[i], Bp[i], lowerKeep) : Ap[i];
        if (act.name === 'die') eyeTarget = eyeCurve(act.t / act.dur);
      }
      if (fade < fadeDur) {
        fade += dt;
        const w = smooth(fade / fadeDur);
        for (let i = 0; i < NCH; i++) Out[i] = lerp(From[i], Bp[i], w);
      } else Out.set(Bp);

      // aim twist (yaw in the root's parent space, 0 = +Z)
      const dead = act && act.name === 'die';
      const wantAim = aimYaw !== null && !dead ? 1 : 0;
      aimW += (wantAim - aimW) * (1 - Math.exp(-dt * 10));
      if (aimYaw !== null) aimRel = Math.max(-1.35, Math.min(1.35, wrap(aimYaw - root.rotation.y)));
      if (aimW > 1e-3) {
        const a = aimRel * aimW;
        if (ctx.hover || ctx.quad) Out[BI.head * 3 + 1] += a;
        else {
          Out[BI.spine * 3 + 1] += a * 0.25; Out[BI.chest * 3 + 1] += a * 0.35;
          Out[BI.neck * 3 + 1] += a * 0.15; Out[BI.head * 3 + 1] += a * 0.25;
        }
      }

      for (let i = 0; i < NB; i++) bones[i].rotation.set(Out[i * 3], Out[i * 3 + 1], Out[i * 3 + 2]);
      const pr = T.rig.off.pelvis;
      bones[0].position.set(pr[0] + Out[PX], pr[1] + Out[PX + 1], pr[2] + Out[PX + 2]);

      if (ctx.hover) {
        rotorSpeed += ((dead ? 0 : 1) - rotorSpeed) * (1 - Math.exp(-dt * 1.5));
        rotor = (rotor + dt * 38 * rotorSpeed) % (Math.PI * 2);
        bones[BI.thighL].rotation.set(0, rotor, 0);
        bones[BI.thighR].rotation.set(0, -rotor, 0);
      }

      eye += (eyeTarget - eye) * (1 - Math.exp(-dt * 25));
      alertW += ((alert ? 1 : 0) - alertW) * (1 - Math.exp(-dt * 8));
      const pulse = alert === 2 ? 1.25 + 0.2 * Math.sin(ctx.t * 9) : alert === 1 ? 1 + 0.25 * Math.sin(ctx.t * 4) : 1;
      if (alert) lastAlert = alert;
      const ac = ALERT_C[alert || lastAlert];
      for (const mm of own) {
        const u = mm.userData, w = alertW * (u.slot === 'eye' ? 1 : 0.85);
        mm.emissive.copy(u.baseC);
        if (ac && w > 1e-3) mm.emissive.lerp(ac, w);
        mm.emissiveIntensity = u.baseEI * eye * lerp(1, pulse, alertW);
      }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) mesh.material = meshMats; }
    },
    dispose() {
      LIVE_ROBOTS.delete(api);
      root.removeFromParent();
      mesh.skeleton.dispose();
      for (const mm of own) mm.dispose();
    },
  };
  api.hover = ctx.hover;
  LIVE_ROBOTS.add(api);
  api.update(0);
  return api;
}

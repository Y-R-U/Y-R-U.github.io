// VECTOR PROTOCOL units: one SkinnedMesh per unit (rigid skinning, parts merged per material slot).
// Contract: docs/TEAM_BRIEF.md "Units". Extras documented in docs/notes/robots.md.
import * as THREE from 'three';
import { makeRig, makeBones, BONES, BI, NB } from './rig.js';
import { PartBuilder } from './parts.js';
import { makeMaterials, shieldMat, rarityIndex, FACTIONS, RARITY_COLORS, createMotes, createAura, createHoverBeam } from './materials.js';
export { RARITY_COLORS };
import { NCH, PX, evalLoop, evalAction, actionDef, LOOPS, powerCurve, smooth, lerp, LIB, twoHand } from './anims.js';
import { MODELS, modelDef, LAUNCH_IDS, register } from './models/index.js';
export { LAUNCH_IDS, register as registerModel };
export { MODELS, FACTIONS };
export { renderPortrait, createTurntable, PORTRAIT_STYLE } from './portrait.js';

export const ANIMS = ['idle', 'advance', 'attack', 'attack_alt', 'cast', 'overdrive', 'hit', 'die', 'victory', 'deploy'];
// 'skin' exists only in the organic (fantasy) set; a model that uses it should drop another slot to stay at 6 draw calls
const SLOTS = ['paint', 'accent', 'metal', 'trim', 'glow', 'eye', 'glow2', 'skin'];

const templates = new Map();
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; }
function rng(seed) { let s = hash(seed) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function rigFor(M) {
  const rig = makeRig(M.dims);
  const D = rig.D;
  if (M.rig === 'quad') {
    D.qhip = {};
    for (const n of ['upArmL', 'upArmR', 'thighL', 'thighR']) {
      const w = rig.world[n], p = rig.world.pelvis;
      D.qhip[n] = [w[0] - p[0], w[1] - p[1], w[2] - p[2]];
    }
  }
  return rig;
}

// default visual rank per rarity (docs/ROSTER.md: rarity sets the ceiling, rank the detail inside it)
const RANK0 = { common: 0, rare: 1, epic: 2, legendary: 3 };
function getTemplate(M, rarity, faction, quality, rank, variant, boss = false, unitId = null) {
  const key = [M.id, M.auto ? M.arch : '', rarity, faction, quality, rank, variant, boss ? 'B' : '', M.byUnitId ? unitId : ''].join('|');
  let t = templates.get(key);
  if (t) return t;
  const rig = rigFor(M);
  const b = new PartBuilder(rig, quality, quality === 'low' ? 'far' : 'near');
  M.build(b, { r: rarityIndex(rarity), rarity, rank, variant, faction, far: b.far, opts: M.opts || {}, quality, def: M, boss, unitId });
  const { geometry, slots, tris } = b.build(SLOTS);
  const h = M.height;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), h * 1.1);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-h, -h * 0.2, -h), new THREE.Vector3(h, h * 1.5, h));
  const inverses = BONES.map((n) => { const w = rig.world[n]; return new THREE.Matrix4().makeTranslation(-w[0], -w[1], -w[2]); });
  t = { rig, geometry, slots, tris, inverses };
  templates.set(key, t);
  return t;
}

// ---- 1-draw-call proxy (mirror + shadow passes): every slot baked into vertex colour/PBR attributes, same skeleton.
const proxyGeo = new Map();
function proxyGeometry(T, key, mats) {
  let g = proxyGeo.get(key);
  if (g) return g;
  g = T.geometry.clone();
  const n = g.attributes.position.count, col = new Float32Array(n * 3), pbr = new Float32Array(n * 3), idx = g.index.array;
  for (const gr of g.groups) {
    const m = mats[gr.materialIndex];
    const glowing = m.emissive && m.emissiveIntensity > 1 && m.color.r + m.color.g + m.color.b < 0.05;
    const c = glowing ? m.emissive.clone().multiplyScalar(m.emissiveIntensity) : m.color;
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      const v = idx[i];
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      pbr[v * 3] = m.metalness; pbr[v * 3 + 1] = m.roughness; pbr[v * 3 + 2] = glowing ? 1 : 0;
    }
  }
  g.clearGroups();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 3));
  proxyGeo.set(key, g);
  return g;
}
let proxyMat = null;
function proxyMaterial() {
  if (proxyMat) return proxyMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 pbr;\nvarying vec3 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPbr;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 glowC = diffuseColor.rgb * vPbr.z; diffuseColor.rgb *= 1.0 - vPbr.z;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPbr.x;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPbr.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowC;');
  };
  m.customProgramCacheKey = () => 'vpProxy';
  return (proxyMat = m);
}

// mats.all and mats.<faction> merge per slot (and per panel option); the faction entry wins key by key
function mergeMats(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && out[k] && typeof out[k] === 'object'
      ? { ...out[k], ...v, ...(out[k].panel || v.panel ? { panel: { ...(out[k].panel || {}), ...(v.panel || {}) } } : {}) } : v;
  }
  return out;
}

export function unitStats(model, opts = {}) {
  const u = createUnit({ model, ...opts });
  const s = { drawCalls: u.drawCalls, tris: u.tris, height: u.height, radius: u.radius };
  u.dispose();
  return s;
}

// opts: model, rarity, faction, rank (visual tier 0..5; default from rarity), seed, quality 'high'|'med'|'low',
// role/loco hints (only used when `model` has no file yet: picks a stand-in archetype).
// boss: true for story bosses (battle passes it with rank 5) so a model can give the boss form extras a player's R5 doesn't get;
// unitId: the UnitDef id (e.g. 'boss_vector_prime'); only part of the geometry cache key when the def sets `byUnitId: true`.
export function createUnit({ model = 'bulwark', rarity, faction, rank, seed = 1, quality = 'high', role, loco, boss = false, unitId = null } = {}) {
  const M = modelDef(model, { role, loco, faction, rarity });
  faction = faction || M.faction;
  rarity = rarity || M.rarity || 'common';
  if (!FACTIONS[faction]) faction = 'corporate';
  if (rank === undefined || rank === null) rank = RANK0[rarity] ?? 0;
  rank = Math.max(0, Math.min(5, rank | 0));
  const variant = M.variants ? (seed >>> 0) % M.variants : 0;
  const T = getTemplate(M, rarity, faction, quality, rank, variant, !!boss, unitId);
  const D = T.rig.D;
  const r01 = rng(seed * 7919 + 13);
  const { mats, palette } = makeMaterials({ realm: M.realm, faction, scheme: M.scheme, rarity, rank, quality, over: { ...(M.glow2 !== undefined ? { glow2: M.glow2 } : {}), ...(M.paint?.[faction] || {}) }, slots: mergeMats(M.mats?.all, M.mats?.[faction]), rimOpt: M.rim || null });
  const meshMats = T.slots.map((s) => mats[s]);
  const allMats = Object.values(mats);

  const bones = makeBones(T.rig);
  if (M.rig === 'quad') for (const n of ['upArmL', 'upArmR', 'thighL', 'thighR']) bones[BI[n]].rotation.order = 'YZX';
  const mesh = new THREE.SkinnedMesh(T.geometry, meshMats);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones, T.inverses), new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = quality === 'high';
  mesh.frustumCulled = true;
  mesh.name = 'unit:' + M.id;
  // optional proxy: unit.useProxy(mirrorLayer) moves mirror + shadow rendering onto a 1-draw-call merged mesh
  let proxy = null;
  function useProxy(mirrorLayer = 2) {
    if (!proxy) {
      const key = [M.id, M.auto ? M.arch : '', rarity, faction, quality, rank, variant, boss ? 'B' : '', M.byUnitId ? unitId : ''].join('|');
      proxy = new THREE.SkinnedMesh(proxyGeometry(T, key, meshMats), proxyMaterial());
      proxy.bind(mesh.skeleton, mesh.bindMatrix);
      proxy.name = 'unit-proxy:' + M.id;
      body.add(proxy);
    }
    proxy.castShadow = true; mesh.castShadow = false;
    proxy.layers.set(mirrorLayer);
    mesh.layers.set(0);
    return proxy;
  }
  const body = new THREE.Group();   // deploy drop / knockback offsets live here, never on root
  body.add(mesh);
  // def.bodyScale [sx, sy, sz]: non-uniform bulk tweak without touching the rig (e.g. widen a too-thin unit)
  if (M.bodyScale) body.scale.set(...M.bodyScale);
  const root = new THREE.Group();
  root.name = 'unit';
  root.add(body);

  // ---- sockets
  const sockets = {};
  const sock = (name, bone, p) => { const o = new THREE.Object3D(); o.name = 'socket:' + name; o.position.fromArray(p); bones[BI[bone]].add(o); sockets[name] = o; return o; };
  const S = M.sockets || {};
  sock('head', 'head', S.head || [0, 0.15, 0.05]);
  sock('core', 'chest', S.core || [0, 0.12, 0.25]);
  sock('hand', 'handR', S.hand || [0, -0.1, 0]);
  sock('handL', 'handL', S.handL || [0, -0.1, 0]);
  const mz = S.muzzle || ['handR', [0, -0.2, 0]];
  sock('muzzle', mz[0], mz[1]);
  if (S.muzzleL) sock('muzzleL', S.muzzleL[0], S.muzzleL[1]);
  if (M.orbs) { sock('orbL', 'aux2', [0, 0, 0]); sock('orbR', 'aux3', [0, 0, 0]); }
  // any other named socket on the def: sockets: { coilL: ['aux2', [0, 0.3, 0]], ... } -> unit.sockets.coilL / unit.socket('coilL')
  for (const [name, v] of Object.entries(S)) {
    if (sockets[name] || !Array.isArray(v) || typeof v[0] !== 'string' || BI[v[0]] === undefined) continue;
    sock(name, v[0], v[1] || [0, 0, 0]);
  }

  // ---- shield bubble (contract setShield) — optional permanent aura
  // def.aura scales with rank like every other rank cue (R0 x0.55 .. R5 x1.2, bubble swells ~2%/rank); a function aura(rank) overrides
  const auraV = typeof M.aura === 'function' ? M.aura(rank) || 0 : (M.aura || 0) * [0.55, 0.7, 0.85, 1, 1.1, 1.2][rank];
  let shield = null, shieldV = auraV, shieldShown = 0;
  function ensureShield() {
    if (shield) return shield;
    const g = new THREE.IcosahedronGeometry(1, quality === 'low' ? 2 : 3);
    shield = new THREE.Mesh(g, shieldMat(M.auraColor ?? palette.glow));
    const sw = auraV ? 1 + 0.02 * rank : 1;
    shield.scale.set(M.radius * 1.55 * sw, M.height * 0.68 * sw, M.radius * 1.55 * sw);
    shield.position.y = M.height * 0.52;
    shield.renderOrder = 5;
    shield.castShadow = false;
    body.add(shield);
    return shield;
  }
  if (shieldV) ensureShield();
  // epic+: idle motes (ROSTER: epic idle particles, legendary constant particles); M.motes = false opts out, or { count, ... }
  let motes = null;
  const ri = rarityIndex(rarity);
  if (rank >= 2 && M.motes !== false && quality !== 'low') {
    motes = createMotes(M.motes?.color ?? (ri >= 3 ? 0xffc23a : palette.glow), { count: [0, 0, 8, 14, 24, 34][rank], radius: M.radius * 0.9, height: M.height * 1.05, ...(M.motes || {}) });
    body.add(motes);
  }
  let hoverBeam = null;
  if (M.hoverBeam) {
    const hb = M.hoverBeam === true ? {} : M.hoverBeam;
    hoverBeam = createHoverBeam(hb.color ?? palette.glow, { height: hb.height ?? (M.dims?.hover || 1) * 0.9, radius: hb.radius ?? M.radius * 0.7 });
    root.add(hoverBeam);
  }
  // R4+: ground aura ring (reads from the top-down battle camera). M.aura_ring = false opts out.
  let auraRing = null;
  if (rank >= 4 && M.auraRing !== false) {
    auraRing = createAura(ri >= 3 ? 0xffc23a : palette.glow, { radius: M.radius, rank });
    root.add(auraRing);
  }

  // ---- anim state
  const style = { ...(M.style || {}), quad: M.rig === 'quad', beast: M.rig === 'beast', hover: M.rig === 'hover', tracked: M.rig === 'tracked' || M.style?.tracked };
  const ctx = {
    D, style, t: r01() * 10, boneIndex: BI, rig: T.rig,
    move: { v: 0, phase: 0, stride: 0 },
    st: { gy: 0, gp: 0, ty: 0, tp: 0, gt: 1 + r01() * 2, tilt: 0, hitDir: 1 },
  };
  const walkSpeed = M.walkSpeed || 1.3;
  const cadence = M.cadence || 0.9;
  const Bp = new Float32Array(NCH), Ap = new Float32Array(NCH), Out = new Float32Array(NCH), From = new Float32Array(NCH);
  let loopName = 'idle', loopT = 0, act = null, fade = 1, fadeDur = 0.15;
  let power = 1, powerTarget = 1, flashT = 0, flashC = new THREE.Color(1, 1, 1), dead = false;
  let extPower = 1, flick = null;   // setPowerScale / flickerPower (EMP, blackout, power-down effects)
  const listeners = new Set();
  const emit = (type, info) => { for (const f of listeners) { try { f(type, info); } catch (e) { console.error(e); } } api.onEventLegacy?.(type, info); };
  function freeze(f) { From.set(Out); fade = 0; fadeDur = Math.max(0.001, f); }
  const socketFor = (type, i) => {
    if (type === 'cast') return sockets.core;
    if (M.orbs && type === 'fire') return i % 2 ? sockets.orbL : sockets.orbR;
    if (sockets.muzzleL && type === 'fire') return i % 2 ? sockets.muzzleL : sockets.muzzle;
    if (type === 'impact' && style.weapon !== 'shield') return sockets.muzzle;
    return type === 'impact' ? sockets.handL : sockets.muzzle;
  };

  // orbs follow the palms (pelvis-space aux bones)
  const _w = new THREE.Vector3(), _o = new THREE.Vector3(), orbPos = [new THREE.Vector3(), new THREE.Vector3()];
  let orbInit = false;
  function updateOrbs(dt) {
    if (!M.orbs) return;
    const pelvis = bones[BI.pelvis];
    mesh.updateMatrixWorld(true);
    const od = act && act.name === 'overdrive' ? smooth(Math.min(1, act.t / act.dur * 4)) * (1 - smooth((act.t / act.dur - 0.85) / 0.15)) : 0;
    ['handL', 'handR'].forEach((h, i) => {
      bones[BI[h]].localToWorld(_w.set(0, -0.2, 0.06));
      pelvis.worldToLocal(_w);
      const t = ctx.t, sgn = i ? -1 : 1;
      _w.x += sgn * 0.1; _w.y += Math.sin(t * 2.3 + i * 2) * 0.03;
      if (od > 0) {
        const a = t * 6 + i * Math.PI;
        _w.lerp(_o.set(Math.cos(a) * 0.75, 0.55 + Math.sin(t * 3) * 0.1, Math.sin(a) * 0.75), od);
      }
      if (!orbInit) orbPos[i].copy(_w);
      orbPos[i].lerp(_w, 1 - Math.exp(-dt * 14));
      const ob = bones[BI[i ? 'aux3' : 'aux2']];
      ob.position.copy(orbPos[i]);
      ob.rotation.y += dt * 2.5; ob.rotation.x = Math.sin(t) * 0.4;
    });
    orbInit = true;
  }

  const api = {
    socket(name) { return sockets[name] || null; }, boss: !!boss, unitId, noDrop: !!M.noDrop, rarityColor: RARITY_COLORS[rarityIndex(rarity)],
    root, mesh, body, sockets, bones, model: M.id, rarity, faction, rank, realm: M.realm, role: M.role, def: M, fxHints: M.fxHints || {},
    height: M.height, radius: M.radius, walkSpeed, palette,
    get drawCalls() { return T.slots.length + (typeof M.extraDrawCalls === 'function' ? M.extraDrawCalls(api) || 0 : M.extraDrawCalls || 0) + (motes ? 1 : 0) + (auraRing ? 1 : 0) + (hoverBeam ? 2 : 0) + (shield && shield.visible ? 1 : 0); }, tris: T.tris,
    get dead() { return dead; },
    get state() { return { loop: loopName, action: act && act.name, dead }; },
    play(name, { loop, speed = 1, fade: f = 0.15 } = {}) {
      if (LOOPS.has(name)) {
        if (loopName !== name || act) freeze(f);
        loopName = name; loopT = 0; act = null; dead = false; powerTarget = 1;
        return Infinity;
      }
      const def = actionDef(name, style, M);
      if (!def) return 0;
      freeze(name === 'hit' ? 0.06 : f);
      if (name === 'hit') ctx.st.hitDir = r01() < 0.5 ? -1 : 1;
      dead = false;
      act = { name, t: 0, dur: def.dur, speed, loop: !!loop && !def.hold, def, fired: 0 };
      return def.dur / speed;
    },
    setFacing(yaw) { root.rotation.y = yaw; },
    hitFlash(color) { flashT = 0.14; flashC.set(color ?? 0xffffff); },
    // Perf (D17): call once after adding the unit. The main mesh renders only on layer 0; a merged 1-dc proxy renders on
    // `mirrorLayer` (planar mirror) and casts the shadow. The light's shadow camera must include that layer:
    // key.shadow.camera.layers.enable(mirrorLayer). Saves ~10 draw calls per unit.
    useProxy,
    // Emissive power multiplier for glow, eyes, seams, motes and aura (1 = normal, 0 = lights out). Persistent until changed.
    setPowerScale(k = 1) { extPower = Math.max(0, k); },
    // Mirror the whole unit left<->right (handedness swap; three flips the winding for negative scale). The battle can use it for
    // units whose off-hand item would face away from the camera on one side (def.mirrorSide = 'player' | 'enemy').
    setMirror(on = true) { body.scale.x = Math.abs(body.scale.x) * (on ? -1 : 1); },
    mirrorSide: M.mirrorSide || null,
    // One-shot EMP blackout: lights stutter off for `dur` seconds, then come back (on top of setPowerScale).
    flickerPower(dur = 1, { min = 0.03 } = {}) { flick = { t: 0, dur, min }; },
    setShield(v) { shieldV = Math.max(auraV, Math.min(1, v || 0)); if (shieldV > 0) ensureShield(); },
    onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    update(dt) {
      dt = Math.min(dt, 0.1);
      ctx.t += dt; loopT += dt;
      const st = ctx.st;
      st.gt -= dt;
      if (st.gt <= 0) { st.gt = 1.8 + r01() * 3; st.ty = (r01() - 0.5) * 0.7; st.tp = (r01() - 0.5) * 0.25; }
      const k = 1 - Math.exp(-dt * 6);
      st.gy += (st.ty - st.gy) * k; st.gp += (st.tp - st.gp) * k;

      // treadmill locomotion for 'advance'
      const m = ctx.move;
      const vt = loopName === 'advance' && !act ? walkSpeed : 0;
      m.v += (vt - m.v) * (1 - Math.exp(-dt * 8));
      const duty = style.quad ? 0.62 : 0.6;
      m.stride = Math.max(m.v, walkSpeed * 0.6) * duty / cadence;
      m.phase = (m.phase + cadence * dt) % 1;

      // actions + events
      powerTarget = 1;
      if (act) {
        act.t += dt * act.speed;
        const u = Math.min(1, act.t / act.dur);
        const evs = act.def.events;
        while (act.fired < evs.length && u >= evs[act.fired][1]) {
          const [type] = evs[act.fired];
          const n = evs.slice(0, act.fired).filter((e) => e[0] === type).length;
          emit(type, { anim: act.name, socket: socketFor(type, n), index: n, unit: api });
          act.fired++;
        }
        powerTarget = powerCurve(act.name, u);
        if (act.t >= act.dur) {
          if (act.loop) { act.t %= act.dur; act.fired = 0; }
          else if (act.def.hold) { act.t = act.dur; dead = act.name === 'die'; }
          else { const n = act.name; freeze(0.22); act = null; emit('end', { anim: n, unit: api }); }
        }
      }
      const ov = M.anims;
      if (ov?.[loopName]) { Bp.fill(0); ov[loopName](Bp, loopT, ctx, LIB); } else evalLoop(loopName, Bp, ctx, loopT);
      if (act) {
        const u = Math.min(1, act.t / act.dur);
        if (ov?.[act.name]) { Ap.fill(0); ov[act.name](Ap, u, ctx, LIB); } else evalAction(act.name, Ap, u, ctx);
        Bp.set(Ap);
      }
      if (fade < fadeDur) {
        fade += dt;
        const w = smooth(fade / fadeDur);
        for (let i = 0; i < NCH; i++) Out[i] = lerp(From[i], Bp[i], w);
      } else Out.set(Bp);
      M.post?.(Out, ctx, act);
      // two-handed weapons: off hand locks onto style.grip (a point in handR space) unless dying / an anim opts out
      if (style.grip && !(act && (act.name === 'die' || style.freeHand?.includes(act.name)))) twoHand(Out, ctx, style.grip, 'L', style.gripOut ?? 0.25);
      for (let i = 0; i < NB; i++) bones[i].rotation.set(Out[i * 3], Out[i * 3 + 1], Out[i * 3 + 2]);
      const pr = T.rig.off.pelvis;
      bones[0].position.set(pr[0] + Out[PX], pr[1] + Out[PX + 1], pr[2] + Out[PX + 2]);

      // deploy drop (accelerating fall onto the plate)
      if (act && act.name === 'deploy') {
        const u = act.t / act.dur, fu = Math.min(1, u / 0.4);
        body.position.y = M.noDrop ? 0 : 7 * (1 - fu * fu);   // noDrop: blink/teleport units materialise in place
      } else body.position.y = 0;
      updateOrbs(dt);
      M.tick?.(api, dt, ctx, bones);

      // emissive power / death fade / hit flash
      if (act && (act.name === 'die' || act.name === 'deploy')) power = powerTarget;
      else power += (powerTarget - power) * (1 - Math.exp(-dt * 12));
      let fk = 1;
      if (flick) {
        flick.t += dt;
        const x = flick.t / flick.dur, m = flick.min;
        fk = x >= 1 ? 1 : LIB.kf(x, [[0, m], [0.07, 0.6], [0.12, m], [0.3, m], [0.33, 0.5], [0.37, m], [0.8, m], [0.85, 0.7], [0.9, 0.2], [1, 1]]);
        if (x >= 1) flick = null;
      }
      const P2 = power * extPower * fk;
      if (flashT > 0) flashT -= dt;
      const fl = Math.max(0, flashT / 0.14);
      for (const mm of allMats) {
        const u = mm.userData.u;
        const isGlow = mm === mats.glow || mm === mats.eye || mm === mats.glow2;
        u.uLife.value = isGlow ? P2 : Math.min(1.6, 0.25 + 0.75 * P2);
        u.uTime.value = ctx.t;
        u.uFlash.value.copy(flashC).multiplyScalar(fl * fl * 0.9);
      }
      if (hoverBeam) { const cu = hoverBeam.userData.cone.material.uniforms; cu.uTime.value = ctx.t; cu.uLife.value = (dead || (act && act.name === 'die') ? 0 : 1) * Math.min(1, P2); hoverBeam.visible = body.position.y < 0.5; }
      if (motes) { motes.material.uniforms.uTime.value = ctx.t; motes.material.uniforms.uLife.value = Math.min(1, P2); }
      if (auraRing) { auraRing.material.uniforms.uTime.value = ctx.t; auraRing.material.uniforms.uLife.value = Math.min(1, P2) * (body.position.y > 0.5 ? 0 : 1); }
      if (shield) {
        const target = act && act.name === 'die' ? 0 : shieldV;
        shieldShown += (target - shieldShown) * (1 - Math.exp(-dt * 6));
        shield.visible = shieldShown > 0.01;
        const u = shield.material.uniforms;
        u.uStrength.value = shieldShown * (0.85 + 0.15 * Math.sin(ctx.t * 3));
        u.uTime.value = ctx.t;
        u.uHit.value = fl;
      }
    },
    dispose() {
      root.removeFromParent();
      mesh.skeleton.dispose();
      for (const mm of allMats) mm.dispose();
      if (shield) { shield.geometry.dispose(); shield.material.dispose(); }
      if (motes) { motes.geometry.dispose(); motes.material.dispose(); }
      if (auraRing) { auraRing.geometry.dispose(); auraRing.material.dispose(); }
      if (hoverBeam) hoverBeam.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      listeners.clear();
    },
  };
  api.play('idle');
  api.update(0);
  return api;
}

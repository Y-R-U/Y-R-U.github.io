// Bedrock animations: read, sample, apply to a built model, write back out.
import * as THREE from 'three';
import { UNIT } from './geo.js';
import { molang } from './molang.js';

// Animation space is model space turned 180° about Y, so a bone's animated position
// flips X on its way into the scene. Rotations use the same rule as geometry bones.
export const ANIM_AXIS = { posX: -1, posY: 1, posZ: 1, rotX: -1, rotY: -1, rotZ: 1 };

// ---------------------------------------------------------------- parsing ---
export function parseAnimFile(json) {
  const out = {};
  if (!json || typeof json !== 'object') return out;
  for (const [name, a] of Object.entries(json.animations || {})) {
    out[name] = {
      name,
      loop: a.loop === true || a.loop === 'hold_on_last_frame' ? a.loop : false,
      length: a.animation_length ?? guessLength(a),
      blendWeight: a.blend_weight,
      override: !!a.override_previous_animation,
      bones: Object.fromEntries(Object.entries(a.bones || {}).map(([b, ch]) => [b, {
        rotation: channel(ch.rotation),
        position: channel(ch.position),
        scale: channel(ch.scale)
      }]))
    };
  }
  return out;
}

function guessLength(a) {
  let max = 0;
  for (const ch of Object.values(a.bones || {})) {
    for (const c of Object.values(ch)) {
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        for (const t of Object.keys(c)) max = Math.max(max, parseFloat(t) || 0);
      }
    }
  }
  return max || 1;
}

/** Normalise any channel form into {static:[x,y,z]} or {keys:[{t,pre,post,lerp}]}. */
function channel(c) {
  if (c == null) return null;
  if (Array.isArray(c)) return { static: c.slice(0, 3) };
  if (typeof c === 'number' || typeof c === 'string') return { static: [c, c, c] };
  const keys = [];
  for (const [t, v] of Object.entries(c)) {
    const time = parseFloat(t);
    if (Number.isNaN(time)) continue;
    let pre, post, lerp = 'linear';
    if (Array.isArray(v)) { pre = post = v.slice(0, 3); }
    else if (v && typeof v === 'object') {
      pre = (v.pre || v.post || [0, 0, 0]).slice(0, 3);
      post = (v.post || v.pre || [0, 0, 0]).slice(0, 3);
      if (v.lerp_mode === 'catmullrom') lerp = 'catmullrom';
      if (v.lerp_mode === 'step') lerp = 'step';
    } else { pre = post = [v, v, v]; }
    keys.push({ t: time, pre, post, lerp });
  }
  keys.sort((a, b) => a.t - b.t);
  return keys.length ? { keys } : null;
}

// --------------------------------------------------------------- sampling ---
function num(v, ctx) { return molang(v, ctx); }

export function sampleChannel(ch, time, ctx, dflt = 0) {
  if (!ch) return [dflt, dflt, dflt];
  if (ch.static) return ch.static.map(v => num(v, ctx));
  const keys = ch.keys;
  if (!keys.length) return [dflt, dflt, dflt];
  if (time <= keys[0].t) return keys[0].pre.map(v => num(v, ctx));
  const last = keys[keys.length - 1];
  if (time >= last.t) return last.post.map(v => num(v, ctx));
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= time) i++;
  const a = keys[i], b = keys[i + 1];
  const span = (b.t - a.t) || 1;
  const t = (time - a.t) / span;
  const av = a.post.map(v => num(v, ctx));
  const bv = b.pre.map(v => num(v, ctx));
  if (a.lerp === 'step') return av;
  if (a.lerp === 'catmullrom' || b.lerp === 'catmullrom') {
    const p0 = (keys[i - 1] || a).post.map(v => num(v, ctx));
    const p3 = (keys[i + 2] || b).pre.map(v => num(v, ctx));
    return [0, 1, 2].map(k => catmull(p0[k], av[k], bv[k], p3[k], t));
  }
  return [0, 1, 2].map(k => av[k] + (bv[k] - av[k]) * t);
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** @returns {Object<string,{rotation:number[],position:number[],scale:number[]}>} */
export function sampleAnim(anim, time, ctx = {}) {
  if (!anim) return {};
  const len = anim.length || 1;
  let t = anim.loop === true ? (len ? ((time % len) + len) % len : 0) : Math.min(time, len);
  const c = { 'query.anim_time': t, 'query.life_time': time, ...ctx };
  const pose = {};
  for (const [bone, ch] of Object.entries(anim.bones)) {
    pose[bone] = {
      rotation: ch.rotation ? sampleChannel(ch.rotation, t, c, 0) : null,
      position: ch.position ? sampleChannel(ch.position, t, c, 0) : null,
      scale: ch.scale ? sampleChannel(ch.scale, t, c, 1) : null
    };
  }
  return pose;
}

/**
 * Apply a sampled pose on top of a built model's rest pose.
 * Call resetPose(built) first if you are applying a fresh frame.
 */
export function applyPose(built, pose, weight = 1) {
  const A = ANIM_AXIS;
  for (const [name, p] of Object.entries(pose)) {
    const g = built.bones.get(name);
    const base = built.base.get(name);
    if (!g || !base) continue;
    if (p.rotation) {
      const [x, y, z] = p.rotation;
      g.rotation.order = 'ZYX';
      g.rotation.set(
        base.rot.x + A.rotX * x * Math.PI / 180 * weight,
        base.rot.y + A.rotY * y * Math.PI / 180 * weight,
        base.rot.z + A.rotZ * z * Math.PI / 180 * weight
      );
    }
    if (p.position) {
      const [x, y, z] = p.position;
      g.position.set(
        base.pos.x + A.posX * x * UNIT * weight,
        base.pos.y + A.posY * y * UNIT * weight,
        base.pos.z + A.posZ * z * UNIT * weight
      );
    }
    if (p.scale) {
      const [x, y, z] = p.scale;
      g.scale.set(
        base.scale.x * (1 + (x - 1) * weight),
        base.scale.y * (1 + (y - 1) * weight),
        base.scale.z * (1 + (z - 1) * weight)
      );
    }
  }
}

// ------------------------------------------------------------- serialising --
export function animsToJSON(anims, formatVersion = '1.8.0') {
  const out = { format_version: formatVersion, animations: {} };
  for (const [name, a] of Object.entries(anims)) {
    const o = {};
    if (a.loop) o.loop = a.loop;
    o.animation_length = round3(a.length || 1);
    if (a.override) o.override_previous_animation = true;
    o.bones = {};
    for (const [bone, ch] of Object.entries(a.bones)) {
      const b = {};
      for (const kind of ['rotation', 'position', 'scale']) {
        const c = ch[kind];
        if (!c) continue;
        if (c.static) { b[kind] = c.static.map(cleanVal); continue; }
        const obj = {};
        for (const k of c.keys) {
          const key = String(round3(k.t));
          if (k.lerp === 'step') obj[key] = { pre: k.pre.map(cleanVal), post: k.post.map(cleanVal), lerp_mode: 'step' };
          else if (k.lerp === 'catmullrom') obj[key] = { post: k.post.map(cleanVal), lerp_mode: 'catmullrom' };
          else if (JSON.stringify(k.pre) !== JSON.stringify(k.post)) obj[key] = { pre: k.pre.map(cleanVal), post: k.post.map(cleanVal) };
          else obj[key] = k.post.map(cleanVal);
        }
        b[kind] = obj;
      }
      if (Object.keys(b).length) o.bones[bone] = b;
    }
    out.animations[name] = o;
  }
  return out;
}
const round3 = v => Math.round(v * 1000) / 1000;
const cleanVal = v => (typeof v === 'number' ? round3(v) : v);

// -------------------------------------------------------------- authoring ---
export function newAnim(name, length = 1, loop = true) {
  return { name, loop, length, bones: {} };
}
export function ensureBone(anim, bone) {
  if (!anim.bones[bone]) anim.bones[bone] = { rotation: null, position: null, scale: null };
  return anim.bones[bone];
}
/** Insert/replace a keyframe. value is [x,y,z]. */
export function setKey(anim, bone, kind, time, value, lerp = 'linear') {
  const b = ensureBone(anim, bone);
  if (!b[kind] || b[kind].static) b[kind] = { keys: b[kind] && b[kind].static ? [{ t: 0, pre: b[kind].static, post: b[kind].static, lerp: 'linear' }] : [] };
  const keys = b[kind].keys;
  const t = Math.round(time * 1000) / 1000;
  const existing = keys.find(k => Math.abs(k.t - t) < 0.001);
  if (existing) { existing.pre = value.slice(); existing.post = value.slice(); existing.lerp = lerp; }
  else keys.push({ t, pre: value.slice(), post: value.slice(), lerp });
  keys.sort((a, b2) => a.t - b2.t);
  anim.length = Math.max(anim.length || 0, t);
  return anim;
}
export function removeKey(anim, bone, kind, time) {
  const ch = anim.bones[bone] && anim.bones[bone][kind];
  if (!ch || !ch.keys) return false;
  const i = ch.keys.findIndex(k => Math.abs(k.t - time) < 0.001);
  if (i < 0) return false;
  ch.keys.splice(i, 1);
  if (!ch.keys.length) anim.bones[bone][kind] = null;
  return true;
}
export function keyTimes(anim, bone) {
  const set = new Set();
  const b = anim.bones[bone];
  if (!b) return [];
  for (const kind of ['rotation', 'position', 'scale']) {
    const c = b[kind];
    if (c && c.keys) c.keys.forEach(k => set.add(Math.round(k.t * 1000) / 1000));
  }
  return [...set].sort((a, b2) => a - b2);
}

/**
 * Which animations should run right now, from a client-entity "scripts.animate" list.
 * Entries are either "name" or {name: "molang condition"}.
 */
export function activeAnimations(animateList, animMap, ctx) {
  const out = [];
  for (const entry of animateList || []) {
    if (typeof entry === 'string') { if (animMap[entry]) out.push({ key: entry, weight: 1 }); continue; }
    for (const [key, cond] of Object.entries(entry)) {
      if (!animMap[key]) continue;
      const w = molang(cond, ctx);
      if (w > 0.001) out.push({ key, weight: Math.min(1, w) });
    }
  }
  return out;
}

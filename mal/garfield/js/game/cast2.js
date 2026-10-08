import * as THREE from '../../vendor/three/three.module.js';

// Wave-3 cast loader: Odie, Lyman, the delivery man and mice, created on first use and cached on the world.
// A missing/broken actor module falls back to a placeholder with the same API (core's stub pattern).

const SOURCES = {
  odie: [['../actors/odie.js', 'createOdie', {}]],
  lyman: [['../actors/lyman.js', 'createLyman', {}], ['../actors/human.js', 'createLyman', {}], ['../actors/humans.js', 'createLyman', {}]],
  delivery: [['../actors/human.js', 'createHuman', { kind: 'delivery' }], ['../actors/humans.js', 'createHuman', { kind: 'delivery' }], ['../actors/delivery.js', 'createDelivery', {}]],
  mice: [['../actors/mice.js', 'createMice', { count: 8 }]],
};

const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export function castStore(world) { return (world._cast2 ||= { actors: {}, pending: {}, lanes: {} }); }

export async function getCast(ctx, kind) {
  const world = ctx.world, store = castStore(world);
  if (store.actors[kind]) { store.actors[kind].root.visible = true; return store.actors[kind]; }
  store.pending[kind] ||= (async () => {
    let actor = null;
    for (const [path, fn, extra] of SOURCES[kind] || []) {
      try {
        const m = await within(import(path), 12000);
        if (!m[fn]) continue;
        actor = await within(Promise.resolve(m[fn]({ quality: ctx.quality, ...extra })), 20000);
        if (actor) { store.lanes[kind] = 'real'; break; }
      } catch (e) { if (!/Failed to fetch|Importing a module|404|timeout/.test(e.message)) console.warn('[cast2]', kind, path, e.message); }
    }
    if (!actor) { actor = placeholder(kind); store.lanes[kind] = 'placeholder'; }
    actor.kind = kind;
    world.scene.add(actor.root);
    store.actors[kind] = actor;
    return actor;
  })();
  const a = await store.pending[kind];
  a.root.visible = true;
  return a;
}

export function hideCast(sysOrCtx) {
  const st = sysOrCtx?.world?._cast2;
  if (!st) return;
  for (const a of Object.values(st.actors)) {
    a.root.visible = false;
    if (a.root.parent && a.root.parent !== sysOrCtx.world.scene) { try { a.leaveSeat?.(sysOrCtx.world.scene); } catch {} sysOrCtx.world.scene.attach(a.root); }
    try { a.holdProp?.(null); a.setMove?.(0); } catch {}
  }
}

export function castUpdate(ctx, dt) {
  const st = ctx.world._cast2;
  if (!st) return;
  for (const a of Object.values(st.actors)) if (a.root.visible) { try { a.update?.(dt); } catch (e) { console.warn('[cast2] update', a.kind, e); } }
}

// ---------------------------------------------------------------------------
// Placeholders: soft, recognisable stand-ins that obey the actor API (clips → simple procedural motion).
function mat(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }); }
function ball(r, c, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(c)); m.scale.set(sx, sy, sz); m.castShadow = true; return m; }
function cyl(r, h, c) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 4, 10), mat(c)); m.castShadow = true; return m; }

function baseActor(root, body, height, radius, anims, sockets) {
  const a = { root, height, radius, anims, sockets, clip: 'idle', speed: 0, t: 0, ev: new Map(), placeholder: true };
  let resolveOnce = null, onceLeft = 0;
  a.play = (name, o = {}) => {
    a.clip = anims.includes(name) ? name : 'idle';
    a.t = 0;
    if (resolveOnce) { resolveOnce(); resolveOnce = null; }
    if (o.once) { onceLeft = o.max || 1.0; return new Promise((r) => (resolveOnce = r)); }
    return Promise.resolve();
  };
  a.setMove = (s) => { a.speed = s; };
  a.lookAt = () => {};
  a.setExpression = () => {};
  a.holdProp = () => {};
  a.on = (n, f) => { (a.ev.get(n) || a.ev.set(n, new Set()).get(n)).add(f); return () => a.ev.get(n)?.delete(f); };
  a.update = (dt) => {
    a.t += dt;
    if (resolveOnce && (onceLeft -= dt) <= 0) { const r = resolveOnce; resolveOnce = null; r(); }
    const c = a.clip, t = a.t;
    body.position.y = 0; body.rotation.set(0, 0, 0); body.scale.set(1, 1, 1);
    if (a.speed > 0.05) body.position.y = Math.abs(Math.sin(t * 9)) * 0.04;
    else if (c === 'idle_pant' || c === 'sit_pant' || c === 'pant') body.scale.y = 1 + Math.sin(t * 14) * 0.03;
    if (/flattened/.test(c)) body.scale.set(1.5, 0.18, 1.5);
    if (/dizzy|shake|stunned/.test(c)) body.rotation.z = Math.sin(t * 30) * 0.06;
    if (/launched|land_head/.test(c)) body.rotation.x = t * 10;
    if (/stuck_wall/.test(c)) body.scale.set(1.3, 1.3, 0.4);
    if (/sit|watch_tv|drink/.test(c) && a.speed < 0.05) body.position.y = -height * 0.15;
    if (/hit|tackle/.test(c)) body.rotation.x = c === 'tackle' ? -0.4 : 0.3;
  };
  a.dispose = () => {};
  return a;
}

function placeholderOdie() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const yellow = 0xf3dc86, black = 0x2a2420;
  const torso = ball(0.2, yellow, 0.85, 0.8, 1.5); torso.position.set(0, 0.42, 0);
  const spot = ball(0.07, black, 0.3, 1, 1); spot.position.set(0.17, 0.46, -0.05);
  const head = ball(0.15, yellow, 1, 1, 1.05); head.position.set(0, 0.62, 0.3);
  const snout = ball(0.08, yellow, 0.9, 0.8, 1.2); snout.position.set(0, 0.58, 0.44);
  const nose = ball(0.035, black); nose.position.set(0, 0.6, 0.53);
  const tongue = ball(0.045, 0xe9768a, 0.9, 0.3, 1.4); tongue.position.set(0, 0.51, 0.46);
  const earL = ball(0.06, black, 0.5, 1.6, 0.9); earL.position.set(-0.14, 0.58, 0.26);
  const earR = earL.clone(); earR.position.x = 0.14;
  const tail = cyl(0.025, 0.22, black); tail.position.set(0, 0.55, -0.3); tail.rotation.x = -0.7;
  body.add(torso, spot, head, snout, nose, tongue, earL, earR, tail);
  for (const [x, z] of [[-0.1, 0.18], [0.1, 0.18], [-0.1, -0.18], [0.1, -0.18]]) { const l = cyl(0.04, 0.26, yellow); l.position.set(x, 0.17, z); body.add(l); }
  const sockets = { head, mouth: snout, tail, back: torso, body: torso };
  const anims = ['idle', 'idle_pant', 'walk', 'run', 'gallop_goofy', 'sit', 'sit_pant', 'jump_up', 'fall', 'land', 'land_head', 'yip_flee', 'bark', 'eat',
    'tackle', 'hit', 'dizzy', 'flattened', 'launched', 'shake_scared', 'lick', 'sniff', 'hug_pile', 'walk_socked', 'stuck_wall'];
  const a = baseActor(root, body, 0.75, 0.25, anims, sockets);
  const socks = [];
  a.setSocks = (o) => {
    const all = o === true ? { ears: 1, tail: 1, mouth: 1 } : o === false ? {} : o || {};
    socks.forEach((s) => s.parent?.remove(s)); socks.length = 0;
    const sock = (p, x, y, z) => { const s = ball(0.05, 0xd94a4a, 1, 1.4, 1); s.position.set(x, y, z); p.add(s); socks.push(s); };
    if (all.ears) { sock(body, -0.15, 0.6, 0.26); sock(body, 0.15, 0.6, 0.26); }
    if (all.tail) sock(body, 0, 0.66, -0.38);
    if (all.mouth) sock(body, 0, 0.58, 0.47);
  };
  return a;
}

function placeholderHuman(kind) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const shirt = kind === 'delivery' ? 0x7a5a2e : 0x4a6aa8, skin = 0xf0c8a0, hair = kind === 'delivery' ? 0x6a3a1a : 0x1c1a1a;
  const legs = cyl(0.11, 0.7, 0x384050); legs.position.y = 0.45;
  const torso = cyl(0.19, 0.45, shirt); torso.position.y = 1.15;
  const head = ball(0.14, skin, 1, 1.12, 1); head.position.y = 1.62;
  const hr = ball(0.145, hair, 1.02, 0.6, 1.02); hr.position.y = 1.7;
  const tash = ball(0.05, hair, 1.6, 0.4, 0.6); tash.position.set(0, 1.56, 0.13);
  body.add(legs, torso, head, hr);
  if (kind !== 'delivery') body.add(tash);
  const handR = new THREE.Object3D(); handR.position.set(0.28, 1.0, 0.1); body.add(handR);
  const handL = new THREE.Object3D(); handL.position.set(-0.28, 1.0, 0.1); body.add(handL);
  const anims = ['idle', 'walk', 'run', 'sit', 'sit_eat', 'stand_up', 'hop_leg', 'cover_face', 'cover_butt', 'throw_newspaper', 'whack', 'talk', 'talk_angry',
    'investigate', 'watch_tv', 'drink_coffee', 'spill', 'brawl_slap', 'brawl_kick', 'brawl_dodge', 'chase', 'catch_mouse', 'hug', 'eat', 'give_bowl',
    'carry_suitcase', 'dramatic', 'walk_in', 'carry_box', 'hand_over', 'frightened', 'poked', 'sneak', 'jump_out', 'scratch_head', 'sigh', 'spilled_on', 'eyes_widen'];
  const a = baseActor(root, body, 1.8, 0.3, anims, { head, handR, handL, hips: legs, face: head, butt: legs });
  a.hitZone = (p) => { const l = root.worldToLocal(p.clone()); return l.y > 1.35 ? 'face' : l.y > 0.75 && l.z < 0 ? 'butt' : l.y > 0.75 ? 'body' : 'leg'; };
  a.setOutfit = (o) => { torso.material.color.set(o === 'disco' ? 0xf8f6ee : shirt); legs.material.color.set(o === 'disco' ? 0xf8f6ee : 0x384050); a.outfit = o; };
  a.setFur = (t) => { if (a.outfit === 'disco') { const c = new THREE.Color(0xf8f6ee).lerp(new THREE.Color(0xe8a050), t * 0.6); torso.material.color.copy(c); legs.material.color.copy(c); } };
  a.sitAt = (seat, clip = 'sit') => { seat.add(root); root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); a.play(clip); };
  a.leaveSeat = (scene) => { const p = root.getWorldPosition(new THREE.Vector3()); const q = root.getWorldQuaternion(new THREE.Quaternion()); scene.add(root); root.position.copy(p).setY(0); root.quaternion.copy(q); };
  return a;
}

function placeholderMice(count = 8) {
  const root = new THREE.Group();
  const mice = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Group();
    const b = ball(0.035, 0x8a8a90, 1, 0.8, 1.6); b.position.y = 0.03;
    const t = cyl(0.006, 0.08, 0xd8a0a8); t.rotation.x = Math.PI / 2; t.position.set(0, 0.02, -0.08);
    m.add(b, t); m.visible = false; root.add(m);
    mice.push({ m, path: null, i: 0, speed: 1.6 + Math.random() * 0.8 });
  }
  return {
    root, mice, anims: [], height: 0.05, radius: 0.04, sockets: {}, placeholder: true,
    play() {}, setMove() {},
    setPaths(paths) { mice.forEach((o, i) => { o.path = paths[i % paths.length]?.map((p) => p.clone()); o.i = 0; o.m.visible = !!o.path; if (o.path) o.m.position.copy(o.path[0]); }); },
    show(on) { mice.forEach((o) => (o.m.visible = on && !!o.path)); },
    update(dt) {
      for (const o of mice) {
        if (!o.path || !o.m.visible) continue;
        const tgt = o.path[(o.i + 1) % o.path.length];
        const d = tgt.clone().sub(o.m.position); d.y = 0;
        const L = d.length();
        if (L < 0.05) { o.i = (o.i + 1) % o.path.length; continue; }
        o.m.position.addScaledVector(d, Math.min(1, (o.speed * dt) / L));
        o.m.rotation.y = Math.atan2(d.x, d.z);
      }
    },
    dispose() {},
  };
}

function placeholder(kind) {
  if (kind === 'odie') return placeholderOdie();
  if (kind === 'mice') return placeholderMice(8);
  return placeholderHuman(kind);
}

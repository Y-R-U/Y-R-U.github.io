// Turns a built hole (js/course/builder.js) into a THREE scene graph using the theme's materials
// and skins, with greybox fallbacks for anything the theme lacks or that throws.
import * as THREE from 'three';
import { BALL_R, CUP_R } from '../engine/constants.js';

const GROUP_MAT = {
  grass: ['grass'], fringe: ['fringe', 'grass'], wall: ['wall'], wallTop: ['wallTop', 'wall'], trim: ['trim'],
  under: ['wall'], ledge: ['wall'], cupRim: ['cupRim'], sand: ['sand', 'grass'], ice: ['ice', 'grass'], boost: ['boost', 'grass'], bridge: ['bridge', 'grass'], sticky: ['sticky', 'sand', 'grass'],
};
const RECEIVE = new Set(['grass', 'fringe', 'sand', 'ice', 'boost', 'bridge', 'sticky', 'wallTop', 'cupRim', 'cupHole']);
const CAST = new Set(['wall', 'wallTop', 'trim']);

const v = a => new THREE.Vector3(a[0], a[1], a[2]);

export function buildHoleView(scene, hole, theme, fallback, { renderer, camera, quality }) {
  const group = new THREE.Group(); group.name = 'hole';
  const owned = [];
  const material = name => {
    for (const k of GROUP_MAT[name] || [name]) { const m = theme.materials?.[k] || fallback.materials[k]; if (m) return m; }
    return fallback.materials.wall;
  };
  const cupHoleMat = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 1 });
  owned.push(cupHoleMat);
  // ledge drops: a soft shadow band on the floor below each lip (builder ledgeDress), dark at the lip,
  // fading out over ~0.55 m (uv.y 0 → 1). Theme-independent; plain basic material, no custom shader.
  let shadeMat = null;
  const shadeMaterial = () => {
    if (shadeMat) return shadeMat;
    const n = 64, d = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { const a = Math.round(255 * Math.pow(1 - i / (n - 1), 0.6)); d.set([a, a, a, 255], i * 4); }
    const tex = new THREE.DataTexture(d, 1, n);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    shadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.62, alphaMap: tex, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    owned.push(tex, shadeMat);
    return shadeMat;
  };

  // playable meshes
  for (const [name, g] of Object.entries(hole.geo)) {
    if (g.empty) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.idx);
    geo.computeBoundingSphere();
    owned.push(geo);
    const m = new THREE.Mesh(geo, name === 'cupHole' ? cupHoleMat : name === 'shade' ? shadeMaterial() : material(name));
    m.name = 'hole.' + name;
    if (name === 'shade') m.renderOrder = 1;
    m.receiveShadow = RECEIVE.has(name);
    m.castShadow = CAST.has(name);
    group.add(m);
  }

  const skin = (name, opts) => {
    try { const r = theme.skins?.[name]?.(opts); if (r) return r; } catch (e) { console.warn('[skyputt] theme skin failed:', name, e); }
    return fallback.skins[name](opts);
  };
  const place = (obj, p, basis) => {
    const m = new THREE.Matrix4().makeBasis(v(basis[0]), v(basis[1]), v(basis[2]));
    m.setPosition(p[0], p[1], p[2]);
    obj.matrixAutoUpdate = true;
    obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.set(1, 1, 1);
    obj.applyMatrix4(m);
    group.add(obj);
  };

  const rotors = [], pickups = [], updaters = [], movers = [];
  for (const f of hole.features) {
    if (f.type === 'windmill') {
      const s = skin('windmill', f.opts);
      place(s.object, f.p, f.basis);
      if (s.rotor) rotors.push({ rotor: s.rotor, omega: f.omega, phase: f.phase });
    } else if (f.type === 'loop') {
      place(skin('loop', f.opts), f.p, f.basis);
    } else if (f.type === 'tube') {
      const curve = new THREE.CatmullRomCurve3(f.points.map(v), false, 'centripetal');
      const obj = skin('tube', { curve, radius: f.radius });
      obj.traverse?.(o => { o.userData.noOcclude = true; });
      group.add(obj);
    } else if (f.type === 'mover') {
      const obj = skin('mover', f.opts);
      const holder = new THREE.Group(); holder.add(obj);
      place(holder, f.p, f.basis);
      movers.push({ obj: holder, base: holder.position.clone(), slide: f.slide });
    } else if (f.type === 'bumper') {
      place(skin('bumper', f.opts), f.p, f.basis);
    } else if (f.type === 'pickup') {
      const s = skin('pickup', {});
      const holder = new THREE.Group();
      holder.add(s.object || s);
      place(holder, f.p, f.basis);
      pickups.push({ obj: holder, skin: s, p: v(f.p), taken: false, t: 0, index: pickups.length });
    }
  }
  // tee pad and flag
  const tf = hole.teeFrame;
  const tee = skin('teePad', { radius: 0.32 });
  place(tee.object || tee, [tf.p[0], tf.p[1], tf.p[2]], [tf.l.map(x => -x), [0, 1, 0], tf.f.map(x => -x)]);
  const flag = skin('flag', { poleHeight: 0.9 });
  const flagObj = flag.object || flag;
  const cf = hole.cupFrame;
  place(flagObj, [hole.cup.x, hole.cup.y - 0.02, hole.cup.z], [cf.l.map(x => -x), [0, 1, 0], cf.f.map(x => -x)]);
  if (flag.update) updaters.push(flag.update);
  scene.add(group);

  // theme environment (lights, sky, rock, backdrop)
  const bounds = new THREE.Box3(v(hole.bounds.min), v(hole.bounds.max));
  const info = {
    id: hole.id,   // polish3: themes may vary their backdrop per hole (deterministic from the id)
    bounds, path: hole.path.map(v), widths: hole.widths, floor: hole.floor, voids: hole.voids, branches: hole.branches, viewDir: v(hole.viewDir),
    tee: new THREE.Vector3(hole.tee.x, hole.tee.y - BALL_R, hole.tee.z), cup: new THREE.Vector3(hole.cup.x, hole.cup.y, hole.cup.z),
    camera, renderer, quality,
  };
  let env = null;
  const before = new Set(scene.children);
  try { env = theme.buildEnvironment ? theme.buildEnvironment(scene, info) : null; } catch (e) { console.warn('[skyputt] theme environment failed, using greybox', e); env = null; }
  if (!env) env = fallback.buildEnvironment(scene, info);
  // camera occluders: the course + skins, plus theme set pieces that sit near the hole
  const near = bounds.clone().expandByScalar(2.5);
  const occluders = [group];
  for (const o of scene.children) {
    if (before.has(o) || o === group || o.isLight || o.isPoints || o.isSprite) continue;
    try { const bb = new THREE.Box3().setFromObject(o); if (!bb.isEmpty() && bb.intersectsBox(near) && bb.getSize(new THREE.Vector3()).length() < 60) occluders.push(o); } catch { /* skip */ }
  }

  // flag lifts out when the ball is close to the cup (so it never hides a putt dropping)
  let flagLift = 0;
  return {
    group, info, rotors, pickups, flagObj, occluders,
    update(dt, t, worldTime, ball) {
      for (const r of rotors) r.rotor.rotation.z = r.omega * worldTime + r.phase;
      for (const m of movers) {
        const sl = m.slide, o = sl.amp * Math.sin(sl.omega * worldTime + sl.phase);
        m.obj.position.set(m.base.x + sl.dir[0] * o, m.base.y + sl.dir[1] * o, m.base.z + sl.dir[2] * o);
      }
      for (const u of updaters) u(dt, t);
      for (const p of pickups) {
        if (p.skin.update) p.skin.update(dt, t);
        if (p.taken) {
          p.t += dt;
          p.obj.position.y += dt * 1.6; p.obj.scale.setScalar(Math.max(0.001, 1 - p.t * 1.8));
          if (p.t > 0.6) p.obj.visible = false;
        }
      }
      if (ball) {
        const d = Math.hypot(ball.x - hole.cup.x, ball.z - hole.cup.z);
        const want = d < 1.0 ? 0.45 : 0;
        flagLift += (want - flagLift) * Math.min(1, dt * 4);
        flagObj.position.y = hole.cup.y - 0.02 + flagLift;
      }
      try { env.update?.(dt, t); } catch (e) { /* theme update errors must not stop play */ }
    },
    dispose() {
      scene.remove(group);
      try { env.dispose?.(); } catch { /* ignore */ }
      for (const o of owned) o.dispose();
    },
  };
}

// The ball: a white sphere with a faint dimple/stripe texture so its roll reads.
export function makeBall() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 4; y < 64; y += 7) for (let x = (y % 14 ? 0 : 3.5); x < 128; x += 7) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
  g.fillStyle = '#e8463a'; g.fillRect(0, 30, 128, 4);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
  mesh.castShadow = true;
  mesh.name = 'ball';
  return mesh;
}

export const CUP_RADIUS = CUP_R;

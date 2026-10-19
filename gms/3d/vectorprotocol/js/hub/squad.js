// The player's own squad living in the compound: real unit models (js/actors/units.js) parked in the barracks bays,
// patrolling the yard and standing guard. Loaded lazily so a broken model file can never take the hub down (D19).
import * as THREE from 'three';
import { glowTex } from './textures.js';
import { MIRROR_ONLY_LAYER } from '../fx/reflection.js';

export const DEFAULT_SQUAD = [{ model: 'gunner', rarity: 'common', faction: 'corporate' }, { model: 'scrapper', rarity: 'common', faction: 'rogue' }];
const US = 3.9;            // hub world is ~1.8x the battle board; a 1.8 m gunner reads as a ~5 m mech next to the hangars
const V = (x, z) => new THREE.Vector3(x, 0, z);

// yard routes per stage (world xz); walkers ping-pong with a pause at each end
const WALKS = [
  [[V(-6, 15), V(7, 15), V(9, 6)], [V(9, -12), V(11, 4)]],
  [[V(-6, 15), V(7, 15), V(9, 6)], [V(9, -12), V(11, 4)]],
  [[V(-5, 41.5), V(13, 41.5)], [V(-9, -13), V(-9, 1), V(-4, 7)]],
  [[V(-5, 41.5), V(13, 41.5)], [V(-9, -13), V(-9, 1), V(-4, 7)]],
];
// sentry posts (world xz, facing yaw) used when there are more units than bays + walkers
const POSTS = [[V(-6, -31), 0.3], [V(6.5, -31), -0.3], [V(9, 8), -0.6]];

export function createSquad(scene, compound, { squad, stage = 0, quality = 'high', env = null } = {}) {
  const group = new THREE.Group(); group.name = 'hub-squad';
  scene.add(group);
  const list = squad === false ? [] : (squad && squad.length ? squad : DEFAULT_SQUAD).slice(0, stage >= 2 ? 4 : 3);
  // far LOD: at ~70 device px tall the near-LOD detail is invisible, and 'low' also skips motes (draw calls)
  const uq = 'low';
  const actors = [];
  let disposed = false, ready = false;

  // soft contact shadows, one draw call for the whole squad
  const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: glowTex(), transparent: true, opacity: 0.7, depthWrite: false });
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shMat, 4);
  shadows.count = 0; shadows.renderOrder = 1; shadows.frustumCulled = false;
  // a pool of the unit's own glow colour on the deck: lifts the dark paint off the dark floor at phone size
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, 4);
  pools.count = 0; pools.renderOrder = 2; pools.frustumCulled = false;
  group.add(shadows, pools);

  // where each unit goes: bays first (the hero is parked under the lights), then a walker, then sentries
  function slots() {
    const bays = (compound.fx.bays || []).slice();
    const walks = WALKS[stage].slice();
    const posts = POSTS.slice(stage >= 1 ? 0 : 2);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (i === 1 && walks.length) out.push({ kind: 'walk', path: walks.shift() });
      else if (bays.length) out.push({ kind: 'bay', ...bays.shift() });
      else if (walks.length && stage >= 2) out.push({ kind: 'walk', path: walks.shift() });
      else if (posts.length) { const [p, ry] = posts.shift(); out.push({ kind: 'post', pos: p, ry }); }
    }
    return out;
  }

  import('../actors/units.js').then((U) => {
    if (disposed) return;
    const plan = slots();
    list.forEach((s, i) => {
      const slot = plan[i];
      if (!slot) return;
      let u = null;
      try { u = U.createUnit({ model: s.model, rarity: s.rarity, faction: s.faction, rank: s.rank, seed: 7 + i, quality: uq }); }
      catch (e) { console.warn('[hub] squad unit failed', s.model, e); try { u = U.createUnit({ model: 'gunner', seed: 7 + i, quality: uq }); } catch { return; } }
      u.root.scale.setScalar(US);
      // the hub has no scene.environment: hand the unit the night env so its metal still catches the neon
      if (env) u.root.traverse((o) => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial && !m.envMap) { m.envMap = env; m.envMapIntensity = (m.envMapIntensity ?? 1) * 1.1; m.needsUpdate = true; } });
      try { u.useProxy?.(MIRROR_ONLY_LAYER); } catch { /* proxy is optional */ }
      group.add(u.root);
      const A = { u, slot, t: 0, i, wait: 1 + i * 1.7, seg: 0, dir: 1, fun: 8 + i * 5.3, walking: false };
      if (slot.kind === 'walk') {
        const p = slot.path;
        u.root.position.copy(p[0]);
        u.setFacing(Math.atan2(p[1].x - p[0].x, p[1].z - p[0].z));
      } else {
        u.root.position.copy(slot.pos);
        u.setFacing(slot.ry || 0);
      }
      u.play('idle');
      pools.setColorAt(actors.length, new THREE.Color(u.palette?.glow ?? 0x38e8ff).multiplyScalar(0.45));
      actors.push(A);
    });
    shadows.count = pools.count = actors.length;
    if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
    ready = true;
  }).catch((e) => console.warn('[hub] squad unavailable', e));

  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sc = new THREE.Vector3(), tmp = new THREE.Vector3();
  function stepWalker(A, dt) {
    const { u, slot } = A, p = slot.path;
    if (A.wait > 0) {
      A.wait -= dt;
      if (A.wait <= 0) { u.play('advance', { fade: 0.25 }); A.walking = true; }
      return;
    }
    const a = p[A.seg], b = p[A.seg + A.dir];
    if (!b) { A.dir *= -1; A.wait = 0.01; return; }
    const speed = (u.walkSpeed || 1.3) * US * 0.9;
    tmp.subVectors(b, u.root.position); tmp.y = 0;
    const d = tmp.length();
    const yaw = Math.atan2(tmp.x, tmp.z);
    let dy = yaw - u.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    u.root.rotation.y += dy * Math.min(1, dt * 4);
    // turn on the spot before striding off so feet don't skate sideways
    if (Math.abs(dy) > 0.6) return;
    const step = speed * dt;
    if (d <= step) {
      u.root.position.copy(b); A.seg += A.dir;
      const end = A.seg === 0 || A.seg === p.length - 1;
      if (end) { A.dir = A.seg === 0 ? 1 : -1; A.wait = 3 + ((A.i * 7 + A.seg) % 3) * 1.5; u.play('idle', { fade: 0.3 }); A.walking = false; }
    } else u.root.position.addScaledVector(tmp, step / d);
    void a;
  }

  return {
    group,
    get ready() { return ready; },
    get count() { return actors.length; },
    get drawCalls() { return actors.reduce((n, A) => n + (A.u.drawCalls || 0), 0) + (actors.length ? 2 : 0); },
    update(t, dt) {
      if (!actors.length) return;
      actors.forEach((A, k) => {
        if (A.slot.kind === 'walk') stepWalker(A, dt);
        else {
          // parked units occasionally show off (stretch / weapon check) so the yard never looks frozen
          A.fun -= dt;
          if (A.fun <= 0) { A.fun = 14 + ((A.i * 13) % 7) * 2; A.u.play(A.i % 2 ? 'cast' : 'victory'); }
        }
        A.u.update(dt);
        const r = (A.u.radius || 0.8) * US * 2.4;
        m4.compose(tmp.copy(A.u.root.position).setY(0.07), q0, sc.set(r, 1, r));
        shadows.setMatrixAt(k, m4);
        m4.compose(tmp.setY(0.09), q0, sc.set(r * 2.2, 1, r * 2.2));
        pools.setMatrixAt(k, m4);
      });
      shadows.instanceMatrix.needsUpdate = pools.instanceMatrix.needsUpdate = true;
      void t;
    },
    dispose() {
      disposed = true;
      for (const A of actors) { try { A.u.dispose(); } catch (e) { console.warn(e); } }
      actors.length = 0;
      shadows.geometry.dispose(); shMat.dispose(); pools.geometry.dispose(); poolMat.dispose();
      group.removeFromParent();
    },
  };
}

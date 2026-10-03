// The family in the hero view, driven by state.life: you (ageing), your partner, up to three kids growing
// baby → toddler → kid → teen (a teen works at the line they're assigned to), the dog, and the landmarks
// each retired generation leaves (heritage plaques, a statue in the park, Grandma's House).
import * as THREE from 'three';

const KIDS = { baby: [0.42, 1.45, 0.55], toddler: [0.55, 1.35, 0.65], kid: [0.72, 1.25, 0.75], teen: [0.9, 1.15, 0.92] };
const BENCH = [-3.2, 1.5];

export function createLife(world, kit) {
  const home = world.plots.get('home');
  const root = new THREE.Group();
  root.name = 'life';
  (home ? home.group : world.scene).add(root);
  const crowd = kit.crowd({ count: 6, seed: 77, radius: 400, center: [0, 1, 0] });
  root.add(crowd.mesh);
  crowd.look(0, { top: '#e8776a', bot: '#4a5878', style: 0, hair: 1, skin: 1 });
  crowd.look(1, { top: '#7d9ad6', bot: '#6b5a7d', style: 1, hair: 3, skin: 0 });
  ['#f2b84b', '#9bc66b', '#e58fb0'].forEach((c, i) => crowd.look(2 + i, { top: c, style: [4, 2, 0][i], hair: [0, 2, 3][i], skin: 1 }));
  crowd.look(5, { top: '#6fb7a8', style: 0, hair: 1, skin: 1, acc: 0 });

  const db = kit.builder({});
  kit.props.dog(db, 0, 0, { c: '#d8a26a', c2: '#a8693a' });
  const dog = new THREE.Mesh(db.geometry(), kit.materials.uber);
  dog.castShadow = true;
  dog.visible = false;
  root.add(dog);

  const lm = new THREE.Group();
  world.scene.add(lm);
  let lmKey = '';

  const me = { x: BENCH[0], z: BENCH[1], h: 0, tx: 0, tz: 0, wait: 0 };
  const pal = { x: 0, z: 0, h: 0 };
  const dg = { x: 0, z: 0, h: 0 };
  let t = 0, lastCans = 0, pick = 0, lastTier = -1;
  const kidPos = [0, 1, 2].map((i) => ({ x: 3 + i, z: 1 + i * 0.3, h: 0, tx: 3, tz: 1, wait: i }));

  function step(a, tx, tz, sp, dt) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return false;
    const s = Math.min(d, sp * dt);
    a.x += (dx / d) * s; a.z += (dz / d) * s; a.h = Math.atan2(dx, dz);
    return true;
  }

  function landmarks(fam) {
    const key = JSON.stringify(fam?.landmarks || []);
    if (key === lmKey) return;
    lmKey = key;
    for (const c of [...lm.children]) { lm.remove(c); c.geometry?.dispose(); }
    const b = kit.builder({ bronze: { c: '#b8864e', r: 0.35, m: 0.85 }, stone: '#d8cbbd', trim: '#fbf6ee', gold: { c: '#e8c25a', r: 0.3, m: 0.85 }, wall: '#f6d6c4', roof: '#c56f8e', window: { c: '#f5d9a6', r: 0.3, g: -1 }, glass: '#a7cadb', door: '#a8694a', brick: '#d9907a', pot: '#d9825c', iron: '#4f4a5c', walls: ['#f6d6c4'], roofs: ['#c56f8e'], flowers: ['#f28fa0', '#f6d35c'], leaf: '#8dbf62', leafDark: '#6fa456', dirt: '#c9a27a', white: '#fbf8f2', sign: '#f3d36b', accent: '#e8776a' });
    let statues = 0, museums = 0;
    for (const L of fam?.landmarks || []) {
      if (L.kind === 'plaque') {
        const p = world.plots.get(L.lineId);
        if (!p) continue;
        const x = p.group.position.x - p.bounds.w / 2 + 0.8, z = 3.9;
        b.cyl('bronze', x, 0, z, 0.06, 0.8, 0, { sides: 7 });
        b.slab('bronze', x, 0.75, z, 0.55, 0.42, 0.06, { round: 0.04, rx: -0.3 });
      } else if (L.kind === 'statue' && statues++ < 3) {
        const x = -8.2 + statues * 1.6, z = 3.0;
        b.slab('stone', x, 0, z, 1.0, 0.9, 1.0, { round: 0.1, taper: 0.08 });
        b.cyl('bronze', x, 0.9, z, 0.18, 0.55, 0, { sides: 9, taper: 0.8 });
        b.ball('bronze', x, 1.7, z, 0.3, { detail: 1, smooth: true });
        b.cyl('bronze', x + 0.22, 1.1, z, 0.06, 0.45, 0, { sides: 5, rz: -2.4 });
      } else if (L.kind === 'museum' && museums++ < 1) {
        kit.props.house(b, -15.5, -3.6, { w: 5.0, d: 4.4, floors: 2, chimneys: 1, sides: 'right', shutters: '#c56f8e' });
        b.slab('gold', -15.5, 4.95, -1.3, 2.0, 0.45, 0.1, { round: 0.06 });
      }
    }
    if (b.count) lm.add(b.finish());
  }

  return {
    update(dt, state) {
      if (!state?.life) return;
      t += dt;
      const life = state.life, boot = state.bootstrap || { done: true, cans: 0 };
      const age = life.age || 18;
      crowd.look(0, { hair: age >= 66 ? 6 : age >= 56 ? 7 : 1 });
      crowd.body(0, 1.18, age >= 66 ? 0.9 : 0.95, age >= 66 ? 0.94 : 1);
      const elder = age >= 66;

      if (!boot.done) {
        if (boot.cans > lastCans) pick = 0.6;
        lastCans = boot.cans;
        pick = Math.max(0, pick - dt);
        if (boot.cans === 0 && pick <= 0) crowd.set(0, BENCH[0], 0.12, BENCH[1] - 0.05, 0, 5, 0, 1.2);
        else {
          const tx = -1.0 + Math.sin(t * 0.7) * 0.8, tz = 2.4 + Math.cos(t * 0.5) * 0.6;
          const moving = pick <= 0 && step(me, tx, tz, 1.2, dt);
          crowd.set(0, me.x, 0.02, me.z, me.h, pick > 0 ? 7 : moving ? 1 : 0, 0, pick > 0 ? 7 : 4);
        }
        for (let i = 1; i < 6; i++) crowd.hide(i);
        dog.visible = false;
        crowd.commit();
        landmarks(state.family);
        return;
      }

      const tier = life.homeTier || 0;
      const door = tier === 0 ? BENCH : [5.4, 0.2];
      if (tier !== lastTier) { lastTier = tier; me.x = door[0]; me.z = door[1] + 0.8; }
      me.wait -= dt;
      if (me.wait <= 0) { me.tx = door[0] + (Math.random() - 0.4) * 7; me.tz = 1.0 + Math.random() * 2.4; me.wait = 5 + Math.random() * 6; }
      const walking = step(me, me.tx, me.tz, elder ? 0.6 : 1.0, dt);
      crowd.set(0, me.x, 0.02, me.z, walking ? me.h : 0.3, walking ? 1 : 0, 0, elder ? 2.6 : 4);

      if (life.partner) {
        const tx = me.x + Math.cos(me.h + 1.6) * 0.9, tz = me.z - Math.sin(me.h + 1.6) * 0.9;
        const w = step(pal, tx, tz, 1.3, dt);
        crowd.set(1, pal.x, 0.02, pal.z, w ? pal.h : me.h + 0.4, w ? 1 : 0, 0.5, 4);
      } else { crowd.hide(1); pal.x = me.x + 1; pal.z = me.z; }

      for (let i = 0; i < 3; i++) {
        const k = life.kids?.[i];
        if (!k) { crowd.hide(2 + i); continue; }
        const [s, head, leg] = KIDS[k.stage] || KIDS.kid;
        crowd.body(2 + i, head, leg, s);
        const kp = kidPos[i];
        if (k.stage === 'baby') { crowd.set(2 + i, pal.x + 0.5, 0.02, pal.z + 0.3, 0.2, 5, i, 1); continue; }
        if (k.stage === 'teen' && k.workedLine && world.plots.get(k.workedLine)) {
          const p = world.plots.get(k.workedLine), a = p.pileAnchor || [0, 0, 2];
          crowd.hide(2 + i);
          const wx = p.group.position.x - home.group.position.x + a[0] + 0.9, wz = p.group.position.z - home.group.position.z + a[2] + 0.7;
          crowd.body(5, head, leg, s);
          crowd.set(5, wx, 0.02, wz, -0.6, 3, i, 4.5);
          continue;
        }
        kp.wait -= dt;
        if (kp.wait <= 0) { kp.tx = me.x + (Math.random() - 0.5) * 4; kp.tz = 1.2 + Math.random() * 2.2; kp.wait = 2 + Math.random() * 3; }
        const w = step(kp, kp.tx, kp.tz, k.stage === 'toddler' ? 0.6 : 1.6, dt);
        crowd.set(2 + i, kp.x, 0.02, kp.z, kp.h, w ? 1 : (Math.sin(t + i) > 0.5 ? 4 : 0), i * 1.3, k.stage === 'toddler' ? 3 : 5);
      }
      if (!life.kids?.some((k) => k.stage === 'teen' && k.workedLine)) crowd.hide(5);

      dog.visible = !!life.dog;
      if (dog.visible) {
        const tx = me.x - Math.sin(me.h) * 0.9 + 0.5, tz = me.z - Math.cos(me.h) * 0.9;
        const w = step(dg, tx, tz, 1.6, dt);
        dog.position.set(dg.x, 0.02 + (w ? Math.abs(Math.sin(t * 9)) * 0.05 : 0), dg.z);
        dog.rotation.y = w ? dg.h : dg.h + Math.sin(t * 0.8) * 0.4;
      }
      crowd.commit();
      landmarks(state.family);
    },
  };
}

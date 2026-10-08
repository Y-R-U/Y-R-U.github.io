import { THREE, makeProp, Builder, lathe, gloss, ease, Particles, worldPos, rng, palette } from './util.js';
import { buildSteakDinner, buildLasagnaPlate, buildMeatloafPlate, setFoodEaten, tickFood, foodMats } from '../food.js';

export const FOOD_SCALE = 1.4; // a touch over real size so the food reads from Garfield's camera

const builders = { steak: buildSteakDinner, lasagna: buildLasagnaPlate, meatloaf: buildMeatloafPlate };

export function plateMesh() {
  const pal = palette().gloss;
  const b = new Builder();
  const prof = [[0, 0.004], [0.06, 0.004], [0.075, 0.0], [0.085, 0.004], [0.088, 0.011], [0.1, 0.014], [0.13, 0.02], [0.136, 0.023], [0.137, 0.019],
    [0.128, 0.015], [0.098, 0.011], [0.088, 0.008], [0.08, 0.006], [0.07, 0.009], [0.06, 0.012], [0, 0.012]];
  b.add(lathe(prof, 48), pal, null, 0xfffaf0);
  b.add(lathe([[0.1295, 0.0203], [0.1225, 0.0185]], 48), pal, { pos: [0, 0.0008, 0] }, 0x3d7cc9);
  const m = b.build('plate', { cast: false });
  return m;
}

export function createPlate(ctx, id = 'plate') {
  const p = makeProp(id, ctx);
  const q = ctx.quality || 'high';
  const holder = new THREE.Group(); holder.scale.setScalar(FOOD_SCALE);
  p.root.add(holder);
  const dish = new THREE.Group(); holder.add(dish);
  dish.add(plateMesh());
  let food = null, kind = null;
  const cache = {};
  const home = { pos: null, rotY: 0, parent: null };

  // splat decal left on the floor after a fling
  const splat = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), gloss(0x5c2a0e, { roughness: 0.1, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  splat.rotation.x = -Math.PI / 2; splat.visible = false; splat.receiveShadow = true;
  {
    const pos = splat.geometry.attributes.position;
    for (let i = 1; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), a = Math.atan2(y, x);
      const k = 0.72 + 0.16 * Math.sin(a * 5 + 1) + 0.1 * Math.sin(a * 9) + 0.22 * Math.max(0, Math.sin(a * 7 + 2)) ** 3;
      pos.setXY(i, x * k, y * k);
    }
  }
  const crumbGeo = new THREE.SphereGeometry(0.009, 6, 5);
  const crumbs = new Particles(ctx.scene, { count: 30, geo: crumbGeo, material: foodMats().pea, floorY: ctx.floorY ?? 0, bounce: 0.35 });
  p.onUpdate(dt => { crumbs.update(dt); tickFood(food, dt); });

  p.setFood = k => {
    if (k === kind) return;
    if (food) dish.remove(food);
    kind = k;
    if (!k) { food = null; return; }
    if (!cache[k]) cache[k] = builders[k](q);
    food = cache[k];
    setFoodEaten(food, 0);
    dish.add(food);
    p.state.kind = k;
  };
  p.food = () => food;
  p.pos = new THREE.Vector3();
  const syncPos = () => worldPos(p.root, p.pos);

  Object.assign(p.state, { eaten: 0, onFloor: false, flying: false });
  let lastBite = 0;
  p.eaten = t => {
    p.state.eaten = THREE.MathUtils.clamp(t, 0, 1);
    setFoodEaten(food, p.state.eaten);
    // a little spray of crumbs on each new bite
    const bite = Math.floor(p.state.eaten * 12);
    if (bite > lastBite && p.state.eaten < 1) {
      crumbs.mesh.material = kind === 'steak' ? foodMats().pea : kind === 'lasagna' ? foodMats().sauce : foodMats().loaf;
      const at = worldPos(p.root, new THREE.Vector3()); at.y += 0.06;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        crumbs.spawn({ pos: at, vel: new THREE.Vector3(Math.cos(a) * 0.5, 0.9 + Math.random() * 0.5, Math.sin(a) * 0.5), life: 1.2, size: 0.5 + Math.random() * 0.4, floorY: at.y - 0.05 });
      }
    }
    lastBite = bite;
  };

  p.jolt = (s = 1) => {
    if (p.state.flying) return;
    const r = Math.random() - 0.5;
    p.anim.tween(0.42, (e, k) => {
      dish.position.y = Math.max(0, Math.sin(Math.min(1, k * 1.6) * Math.PI)) * 0.05 * s + Math.abs(Math.sin(k * 25)) * (1 - k) * 0.006 * s;
      dish.rotation.z = r * 0.25 * Math.sin(k * Math.PI) * s;
      dish.rotation.y = r * 0.3 * k * s;
      dish.position.x = r * 0.03 * k * s;
    }, ease.linear).then(() => { dish.position.y = 0; dish.rotation.z = 0; });
    p.sfx('click', { vol: 0.6, rate: 0.8 });
  };

  // Arc off the table to a floor point; lands upright with a splat, food (mostly) still on it.
  p.fling = async (toPos, { dur = 0.75, height = 0.55 } = {}) => {
    if (p.state.flying) return;
    p.state.flying = true;
    const scene = ctx.scene;
    syncPos();
    const from = p.pos.clone();
    scene.attach(p.root);
    const to = toPos.clone();
    const rotY0 = p.root.rotation.y;
    const peak = Math.max(from.y, to.y) + height;
    p.sfx('swipe', { vol: 0.6 });
    await p.anim.tween(dur, (e, r) => {
      p.root.position.x = from.x + (to.x - from.x) * r;
      p.root.position.z = from.z + (to.z - from.z) * r;
      // quadratic through from → peak → to
      const a = from.y, c = to.y, b = 2 * peak - (a + c) / 2;
      p.root.position.y = (1 - r) * (1 - r) * a + 2 * (1 - r) * r * b + r * r * c;
      p.root.rotation.y = rotY0 + r * 4.5;
      dish.rotation.x = Math.sin(r * Math.PI) * 0.6;
      dish.rotation.z = Math.sin(r * Math.PI * 2) * 0.25;
    }, ease.linear);
    dish.rotation.set(0, 0, 0);
    p.sfx('crash', { vol: 0.9, rate: 1.1 });
    crumbs.mesh.material = kind === 'steak' ? foodMats().pea : kind === 'lasagna' ? foodMats().sauce : foodMats().loaf;
    splat.material.color.set(kind === 'steak' ? 0x5c2a0e : kind === 'lasagna' ? 0xb8321a : 0x9e2a12);
    splat.position.set(to.x, to.y + 0.003, to.z);
    splat.scale.setScalar(0.2);
    scene.add(splat); splat.visible = true;
    const fly = new THREE.Vector3();
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      crumbs.spawn({ pos: to.clone().add(new THREE.Vector3(0, 0.05, 0)), vel: fly.set(Math.cos(a) * (0.6 + Math.random()), 0.8 + Math.random(), Math.sin(a) * (0.6 + Math.random())), life: 30, size: 0.7 + Math.random() * 0.6 });
    }
    await p.anim.tween(0.35, (e, r) => {
      const s = 1 + Math.sin(r * Math.PI * 3) * (1 - r) * 0.18;
      holder.scale.set(FOOD_SCALE * s, FOOD_SCALE / s, FOOD_SCALE * s);
      splat.scale.setScalar(0.2 + 0.8 * e);
    }, ease.outQuad);
    holder.scale.setScalar(FOOD_SCALE);
    p.state.flying = false; p.state.onFloor = true;
    syncPos();
  };

  p.place = anchor => {
    home.pos = anchor.pos.clone(); home.rotY = anchor.rotY || 0;
    p.root.position.copy(home.pos); p.root.rotation.y = home.rotY;
    home.parent = p.root.parent;
    syncPos();
  };
  p.setHomeParent = par => { home.parent = par; };
  p.reset = () => {
    p.anim.clear(); crumbs.clear();
    if (home.parent && p.root.parent !== home.parent) home.parent.add(p.root);
    if (home.pos) { p.root.position.copy(home.pos); p.root.rotation.set(0, home.rotY, 0); }
    dish.position.set(0, 0, 0); dish.rotation.set(0, 0, 0); holder.scale.setScalar(FOOD_SCALE);
    splat.visible = false; splat.removeFromParent();
    Object.assign(p.state, { eaten: 0, onFloor: false, flying: false });
    p.eaten(0);
    syncPos();
  };
  p.update0 = p.update;
  p.update = dt => { p.update0(dt); syncPos(); };
  return p;
}

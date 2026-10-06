import { THREE, makeProp, Builder, roundedBox, gloss, ease, worldPos, palette } from './util.js';
import { buildLasagnaPanFilling, tickFood } from '../food.js';

const W = 0.32, D = 0.22, H = 0.065, WALL = 0.014;
const PAN_SCALE = 1.2;

export function createPan(ctx) {
  const p = makeProp('pan', ctx);
  const q = ctx.quality || 'high';
  const PAL = palette();
  const holder = new THREE.Group(); holder.scale.setScalar(PAN_SCALE); p.root.add(holder);
  const b = new Builder();
  b.add(roundedBox(W, 0.016, D, 0.007, 2), PAL.gloss, { pos: [0, 0.008, 0] }, 0xd0552c);
  b.add(roundedBox(W, H, WALL, 0.006, 2), PAL.gloss, { pos: [0, H / 2, D / 2 - WALL / 2] }, 0xd0552c);
  b.add(roundedBox(W, H, WALL, 0.006, 2), PAL.gloss, { pos: [0, H / 2, -D / 2 + WALL / 2] }, 0xd0552c);
  b.add(roundedBox(WALL, H, D, 0.006, 2), PAL.gloss, { pos: [W / 2 - WALL / 2, H / 2, 0] }, 0xd0552c);
  b.add(roundedBox(WALL, H, D, 0.006, 2), PAL.gloss, { pos: [-W / 2 + WALL / 2, H / 2, 0] }, 0xd0552c);
  // rim lip + handles
  b.add(roundedBox(W + 0.008, 0.008, WALL + 0.008, 0.004, 2), PAL.gloss, { pos: [0, H, D / 2 - WALL / 2] }, 0xf7ead2);
  b.add(roundedBox(W + 0.008, 0.008, WALL + 0.008, 0.004, 2), PAL.gloss, { pos: [0, H, -D / 2 + WALL / 2] }, 0xf7ead2);
  b.add(roundedBox(WALL + 0.008, 0.008, D, 0.004, 2), PAL.gloss, { pos: [W / 2 - WALL / 2, H, 0] }, 0xf7ead2);
  b.add(roundedBox(WALL + 0.008, 0.008, D, 0.004, 2), PAL.gloss, { pos: [-W / 2 + WALL / 2, H, 0] }, 0xf7ead2);
  for (const s of [-1, 1]) b.add(roundedBox(0.035, 0.012, 0.11, 0.006, 2), PAL.gloss, { pos: [s * (W / 2 + 0.016), H - 0.008, 0] }, 0xd0552c);
  b.add(new THREE.BoxGeometry(W - WALL * 2, 0.002, D - WALL * 2), PAL.gloss, { pos: [0, 0.017, 0] }, 0xf7ead2);
  // baked-on cheese spilling over the rim
  for (const [x, z, L] of [[-0.09, 1, 0.022], [0.03, 1, 0.012], [0.105, 1, 0.028], [-0.03, -1, 0.018], [0.08, -1, 0.01]]) {
    const zi = z * (D / 2 - WALL), zo = z * (D / 2 + 0.006);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x, H - 0.006, zi), new THREE.Vector3(x, H + 0.007, z * (D / 2 - WALL / 2)),
      new THREE.Vector3(x, H - 0.004, zo), new THREE.Vector3(x, H - 0.006 - L, zo)]);
    b.add(new THREE.TubeGeometry(c, 12, 0.0065, 8), PAL.gloss, null, 0xf2b844);
    b.add(new THREE.SphereGeometry(0.0075, 8, 6), PAL.gloss, { pos: [x, H - 0.006 - L, zo] }, 0xf2b844);
  }
  const dish = b.build('panDish', { cast: false });
  holder.add(dish);

  const FW = W - WALL * 2 - 0.002, FD = D - WALL * 2 - 0.002, FH = H - 0.012;
  const filling = buildLasagnaPanFilling(FW, FD, FH, q);
  filling.position.y = 0.017;
  holder.add(filling);
  const served = filling.userData.served;

  p.onUpdate(dt => tickFood(filling, dt));
  Object.assign(p.state, { served: false, inFridge: false, eaten: 0 });
  const home = { pos: null, rotY: 0, parent: null };
  p.pos = new THREE.Vector3();

  // Jon spoons a portion out: it lifts, wobbles and fades toward his plate (plate.setFood('lasagna') pairs with this).
  p.serveScoop = async (dur = 0.8) => {
    if (p.state.served) return;
    p.state.served = true;
    const y0 = served.position.y;
    p.sfx('pop', { vol: 0.5 });
    await p.anim.tween(dur, (e, r) => {
      served.position.y = y0 + Math.sin(Math.min(1, r * 1.4) * Math.PI / 2) * 0.12;
      served.rotation.z = Math.sin(r * 12) * 0.05;
      const s = r > 0.7 ? 1 - (r - 0.7) / 0.3 : 1;
      served.scale.setScalar(Math.max(0.001, s));
    }, ease.linear);
    served.visible = false; served.position.y = y0; served.scale.setScalar(1); served.rotation.z = 0;
  };

  // Slides from wherever it is now into a fridge slot (Object3D); Jon may carry it there first via holdProp.
  p.fridgeSlot = null;
  p.toFridge = async (slot = p.fridgeSlot, dur = 0.5) => {
    if (!slot) return;
    const from = worldPos(p.root, new THREE.Vector3());
    const to = worldPos(slot, new THREE.Vector3());
    ctx.scene.attach(p.root);
    const r0 = p.root.rotation.y;
    await p.anim.tween(dur, (e) => {
      p.root.position.lerpVectors(from, to, e);
      p.root.position.y += Math.sin(e * Math.PI) * 0.05;
      p.root.rotation.y = r0 * (1 - e);
    }, ease.inOut);
    slot.add(p.root); p.root.position.set(0, 0, 0); p.root.rotation.set(0, 0, 0);
    p.state.inFridge = true;
  };

  // L5: Garfield grabs the pan off the vine — a clatter + wobble (holder only, so callers can move root freely).
  p.swingCatch = async () => {
    p.sfx('crash', { vol: 0.6, rate: 1.4 });
    await p.anim.tween(0.45, (e, r) => {
      holder.rotation.z = Math.sin(r * 22) * (1 - r) * 0.08;
      holder.rotation.x = Math.sin(r * 17) * (1 - r) * 0.05;
      holder.position.y = Math.abs(Math.sin(r * 9)) * (1 - r) * 0.025;
    }, ease.linear);
    holder.rotation.set(0, 0, 0); holder.position.y = 0;
  };

  p.jolt = (s = 1) => {
    p.anim.tween(0.4, (e, r) => {
      holder.position.y = Math.max(0, Math.sin(Math.min(1, r * 1.7) * Math.PI)) * 0.035 * s + Math.abs(Math.sin(r * 28)) * (1 - r) * 0.004;
      holder.rotation.x = Math.sin(r * Math.PI) * 0.06 * s;
    }, ease.linear).then(() => { holder.position.y = 0; holder.rotation.x = 0; });
  };

  // 5 merged portions disappear back-to-front; the served one (if still in the pan) goes first
  p.eaten = t => {
    t = THREE.MathUtils.clamp(t, 0, 1);
    p.state.eaten = t;
    const N = filling.userData.portionCount + (p.state.served ? 0 : 1);
    let left = Math.ceil((1 - t) * N - 1e-6);
    if (!p.state.served) { served.visible = left === N; if (left === N) left = N - 1; else left = Math.min(left, N - 1); }
    filling.userData.setPortions(left);
    filling.userData.bed.visible = t < 0.999;
    if (filling.userData.steam) filling.userData.steam.userData.strength = 1 - t;
  };
  p.place = anchor => {
    home.pos = anchor.pos.clone(); home.rotY = anchor.rotY || 0; home.parent = p.root.parent;
    p.root.position.copy(home.pos); p.root.rotation.y = home.rotY;
  };
  p.reset = () => {
    p.anim.clear();
    if (home.parent && p.root.parent !== home.parent) home.parent.add(p.root);
    if (home.pos) { p.root.position.copy(home.pos); p.root.rotation.set(0, home.rotY, 0); }
    holder.position.set(0, 0, 0); holder.rotation.set(0, 0, 0);
    filling.userData.setPortions(filling.userData.portionCount); filling.userData.bed.visible = true;
    served.visible = true;
    Object.assign(p.state, { served: false, inFridge: false, eaten: 0 });
    if (filling.userData.steam) filling.userData.steam.userData.strength = 1;
  };
  p.update0 = p.update;
  p.update = dt => { p.update0(dt); worldPos(p.root, p.pos); };
  p.size = { w: W * PAN_SCALE, d: D * PAN_SCALE, h: H * PAN_SCALE };
  return p;
}

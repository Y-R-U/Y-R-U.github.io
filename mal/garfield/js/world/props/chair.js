import { THREE, makeProp, addBox, syncColliders, Builder, roundedBox, lathe, mat, woodTex, ease, Particles, worldPos } from './util.js';

const SEAT = 0.46, SW = 0.44, SD = 0.42, BACK = 0.98;
const LEG_X = SW / 2 - 0.035, LEG_Z = SD / 2 - 0.035;
const BREAK_Y = 0.24;

function leg(h) {
  return lathe([[0, 0], [0.019, 0], [0.021, 0.03], [0.017, h * 0.4], [0.022, h * 0.5], [0.017, h * 0.6], [0.02, h], [0, h]], 10);
}

export function createChair(ctx) {
  const p = makeProp('chair', ctx);
  const wood = mat(0xffffff, { map: woodTex('#b8773f', '#7b4622', 'chair'), roughness: 0.55 });
  const cushion = new THREE.MeshPhysicalMaterial({ color: 0xd9643b, roughness: 0.85, sheen: 0.7, sheenColor: new THREE.Color(0xffb38a) });

  // pivot sits at the back feet so fallBack() rotates about the right axis
  const pivot = new THREE.Group(); pivot.position.set(0, 0, -LEG_Z);
  const body = new THREE.Group(); body.position.set(0, 0, LEG_Z);
  pivot.add(body); p.root.add(pivot);

  const b = new Builder();
  b.add(roundedBox(SW, 0.035, SD, 0.012, 2), wood, { pos: [0, SEAT - 0.04, 0] });
  b.add(roundedBox(SW - 0.06, 0.04, SD - 0.07, 0.018, 3), cushion, { pos: [0, SEAT - 0.005, 0.01] });
  for (const sx of [-1, 1]) b.add(leg(SEAT - 0.058), wood, { pos: [sx * LEG_X, 0, LEG_Z] });
  // both back legs split at BREAK_Y: upper part in the body, lower part a separate mesh that can snap off
  for (const sx of [-1, 1]) b.add(leg(SEAT - 0.058 - BREAK_Y), wood, { pos: [sx * LEG_X, BREAK_Y, -LEG_Z] });
  // back posts with a slight rake + rails + spindles
  for (const sx of [-1, 1]) b.add(roundedBox(0.034, BACK - SEAT + 0.04, 0.03, 0.012, 2), wood, { pos: [sx * LEG_X, (BACK + SEAT) / 2 - 0.02, -LEG_Z - 0.02], rot: [-0.08, 0, 0] });
  b.add(roundedBox(SW - 0.02, 0.07, 0.03, 0.014, 2), wood, { pos: [0, BACK - 0.04, -LEG_Z - 0.055], rot: [-0.08, 0, 0] });
  b.add(roundedBox(SW - 0.06, 0.03, 0.025, 0.01, 2), wood, { pos: [0, SEAT + 0.14, -LEG_Z - 0.03], rot: [-0.08, 0, 0] });
  for (const x of [-0.09, 0, 0.09]) b.add(new THREE.CylinderGeometry(0.009, 0.009, BACK - SEAT - 0.2, 8), wood, { pos: [x, SEAT + 0.27, -LEG_Z - 0.04], rot: [-0.08, 0, 0] });
  // stretchers
  b.add(new THREE.CylinderGeometry(0.01, 0.01, SW - 0.06, 8), wood, { pos: [0, 0.14, LEG_Z], rot: [0, 0, Math.PI / 2] });
  b.add(new THREE.CylinderGeometry(0.01, 0.01, SD - 0.06, 8), wood, { pos: [LEG_X, 0.16, 0], rot: [Math.PI / 2, 0, 0] });
  b.add(new THREE.CylinderGeometry(0.01, 0.01, SD - 0.06, 8), wood, { pos: [-LEG_X, 0.16, 0], rot: [Math.PI / 2, 0, 0] });
  body.add(b.build('chairBody'));

  // lower back legs: [0] = left (-X), [1] = right (+X); matches legPos() / legPosR()
  const jag = new THREE.ConeGeometry(0.02, 0.03, 6);
  const lowers = [-1, 1].map(sx => {
    const m = new THREE.Mesh(leg(BREAK_Y), wood);
    m.castShadow = m.receiveShadow = true;
    const home = new THREE.Vector3(sx * LEG_X, 0, -LEG_Z);
    m.position.copy(home); body.add(m);
    const up = new THREE.Mesh(jag, wood); up.position.set(sx * LEG_X, BREAK_Y - 0.012, -LEG_Z); up.rotation.x = Math.PI; up.visible = false;
    const dn = new THREE.Mesh(jag, wood); dn.position.set(0, BREAK_Y + 0.012, 0); dn.visible = false;
    body.add(up); m.add(dn);
    return { m, home, up, dn, sx, vel: new THREE.Vector3(), spin: new THREE.Vector3(), flying: false };
  });

  // Jon socket: seat surface centre
  const seat = new THREE.Object3D(); seat.name = 'chairSeat'; seat.position.set(0, SEAT, 0.0); body.add(seat);
  p.seat = seat;

  const splinterGeo = new THREE.BoxGeometry(0.006, 0.006, 0.04);
  const splinters = new Particles(ctx.scene, { count: 40, geo: splinterGeo, material: wood, floorY: ctx.floorY ?? 0, bounce: 0.3, shadows: false });
  p.onUpdate(dt => splinters.update(dt));

  addBox(p, 'seat', body, [-SW / 2, SEAT - 0.06, -SD / 2], [SW / 2, SEAT, SD / 2], 'surface');
  addBox(p, 'back', body, [-SW / 2, SEAT, -LEG_Z - 0.08], [SW / 2, BACK, -LEG_Z + 0.01], 'solid');

  const st = p.state;
  const resetState = () => Object.assign(st, { broken: false, fallen: false, bouncing: false });
  resetState();

  p.onUpdate(dt => {
    for (const L of lowers) {
      if (!L.flying) continue;
      L.vel.y -= 9.8 * dt;
      L.m.position.addScaledVector(L.vel, dt);
      L.m.rotation.x += L.spin.x * dt; L.m.rotation.z += L.spin.z * dt;
      if (L.m.position.y < 0.02) {
        L.m.position.y = 0.02;
        if (Math.abs(L.vel.y) < 0.8) {
          L.flying = false;
          L.m.rotation.x = Math.PI / 2 * Math.sign(L.m.rotation.x || 1); L.m.rotation.z = 0;
        } else { L.vel.y *= -0.35; L.vel.x *= 0.5; L.vel.z *= 0.5; L.spin.multiplyScalar(0.5); }
      }
    }
  });

  p.seatPos = (out = new THREE.Vector3()) => worldPos(seat, out);
  p.seatQuat = (out = new THREE.Quaternion()) => { seat.updateWorldMatrix(true, false); return seat.getWorldQuaternion(out); };

  // i: 0 = left back leg (legPos), 1 = right back leg (legPosR)
  p.breakLeg = async (i = 0) => {
    if (st.broken) return;
    st.broken = true; st.brokenLeg = i;
    const L = lowers[i ? 1 : 0];
    p.sfx('crash', { rate: 1.6, vol: 0.8 });
    L.up.visible = L.dn.visible = true;
    const at = new THREE.Vector3(L.sx * LEG_X, BREAK_Y, -LEG_Z);
    body.localToWorld(at);
    for (let k = 0; k < 16; k++) {
      splinters.spawn({ pos: at, vel: new THREE.Vector3((Math.random() - 0.5 + L.sx * 0.3) * 2, Math.random() * 2.2, (Math.random() - 0.7) * 2), life: 2.5 + Math.random(), size: 0.6 + Math.random() * 0.9, flat: true });
    }
    L.vel.set(0.9 * L.sx, 1.1, -0.7); L.spin.set(-9, 0, -6 * L.sx); L.flying = true;
    L.m.position.y += 0.01;
    await p.anim.tween(0.22, e => { pivot.rotation.z = 0.06 * L.sx * e; pivot.rotation.x = -0.05 * e; }, ease.outBack);
    syncColliders(p);
  };

  // Teeter, tip, crash onto its back. Total ≈ 1.1 s (teeter 0.35, fall 0.45, settle 0.3).
  p.fallTiming = { teeter: 0.35, fall: 0.45, settle: 0.3 };
  p.fallBack = async () => {
    if (st.fallen) return;
    if (!st.broken) await p.breakLeg();
    st.fallen = true;
    const z0 = pivot.rotation.z, x0 = pivot.rotation.x;
    await p.anim.tween(p.fallTiming.teeter, (e, r) => {
      pivot.rotation.x = x0 - 0.1 * Math.sin(r * Math.PI * 2.5) * (0.5 + r) - 0.08 * r;
      pivot.rotation.z = z0 + 0.03 * Math.sin(r * Math.PI * 3);
    }, ease.linear);
    const x1 = pivot.rotation.x, z1 = pivot.rotation.z, END = -1.38;
    await p.anim.tween(p.fallTiming.fall, e => { pivot.rotation.x = x1 + (END - x1) * e; pivot.rotation.z = z1 * (1 - e) + 0.05 * e; }, ease.inQuad);
    p.sfx('crash', { vol: 1 });
    p.sfx('whack', { vol: 0.6 });
    await p.anim.tween(p.fallTiming.settle, (e, r) => { pivot.rotation.x = END + Math.sin(r * Math.PI) * 0.12 * (1 - r); }, ease.linear);
    pivot.rotation.x = END;
    syncColliders(p);
  };

  // L9: the fat cat walks underneath and the chair (with Jon) jolts up and clatters down.
  p.bounce = async (height = 0.3) => {
    if (st.fallen || st.bouncing) return;
    st.bouncing = true;
    p.sfx('boing', { vol: 0.8 });
    await p.anim.tween(0.55, (e, r) => {
      const hgt = 4 * r * (1 - r) * height;
      pivot.position.y = hgt;
      pivot.rotation.x = -0.12 * Math.sin(r * Math.PI);
      pivot.rotation.z = 0.08 * Math.sin(r * Math.PI * 2);
    }, ease.linear);
    p.sfx('crash', { vol: 0.5, rate: 1.3 });
    await p.anim.tween(0.25, (e, r) => { pivot.position.y = Math.abs(Math.sin(r * Math.PI * 2)) * 0.03 * (1 - r); pivot.rotation.z = 0.03 * Math.sin(r * 20) * (1 - r); }, ease.linear);
    pivot.position.y = 0; pivot.rotation.set(0, 0, 0);
    st.bouncing = false;
    syncColliders(p);
  };

  p.reset = () => {
    p.anim.clear(); splinters.clear();
    pivot.position.set(0, 0, -LEG_Z); pivot.rotation.set(0, 0, 0);
    for (const L of lowers) { L.flying = false; L.m.position.copy(L.home); L.m.rotation.set(0, 0, 0); L.up.visible = L.dn.visible = false; }
    resetState(); syncColliders(p);
  };
  p.legPos = (out = new THREE.Vector3()) => { out.set(-LEG_X, BREAK_Y * 0.6, -LEG_Z); return body.localToWorld(out); };
  p.legPosR = (out = new THREE.Vector3()) => { out.set(LEG_X, BREAK_Y * 0.6, -LEG_Z); return body.localToWorld(out); };
  return p;
}
